/**
 * POST /api/schedule
 * Auto-schedule a task: finds the best working-window slot, avoids conflicts.
 *
 * Replaces the legacy energy-hour slot finder (see OS-2114). Slot selection
 * is now driven by the user's WorkPreferences (working window, block length)
 * rather than a green/yellow/red energy map.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'
import { findBestSlot } from '@/lib/scheduling/engine'
import { getWorkPreferences } from '@/lib/work-preferences'
import { z } from 'zod'

const Schema = z.object({
  taskId: z.string().uuid(),
  searchFrom: z.string().datetime().optional(),
  searchDays: z.number().int().min(1).max(30).default(7),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const task = await prisma.oSTask.findFirst({ where: { id: parsed.data.taskId, userId: auth.userId } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // Get user work preferences (drives working window + block length)
  const workPreferences = await getWorkPreferences(auth.userId)

  // Get existing calendar events as conflicts
  const searchFrom = parsed.data.searchFrom ? new Date(parsed.data.searchFrom) : new Date()
  const searchEnd = new Date(searchFrom)
  searchEnd.setDate(searchEnd.getDate() + parsed.data.searchDays)

  const existingEvents = await prisma.calendarEvent.findMany({
    where: { userId: auth.userId, startAt: { gte: searchFrom }, endAt: { lte: searchEnd } },
    select: { startAt: true, endAt: true },
  })

  const slot = findBestSlot({
    durationMinutes: task.duration,
    workPreferences,
    existingEvents,
    searchFrom,
    searchDays: parsed.data.searchDays,
  })

  if (!slot) {
    return NextResponse.json({ error: 'No suitable slot found in search window' }, { status: 422 })
  }

  // Update task
  const updated = await prisma.oSTask.update({
    where: { id: task.id },
    data: { scheduledAt: slot.startAt, scheduledEnd: slot.endAt },
  })

  // Create/replace calendar event
  await prisma.calendarEvent.deleteMany({ where: { taskId: task.id } })
  await prisma.calendarEvent.create({
    data: {
      userId: auth.userId,
      taskId: task.id,
      title: task.name,
      startAt: slot.startAt,
      endAt: slot.endAt,
      domainId: task.domainId,
    },
  })

  return NextResponse.json({ task: updated, slot })
}