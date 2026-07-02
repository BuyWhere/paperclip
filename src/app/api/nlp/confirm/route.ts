/**
 * POST /api/nlp/confirm
 * Create a task from user-confirmed parsed fields (confirm-chips edited values).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'
import { z } from 'zod'

const Schema = z.object({
  input: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  domainId: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  scheduledHour: z.number().min(0).max(23).nullable().optional(),
  durationMinutes: z.number().min(1).max(480).nullable().optional(),
  dayOffset: z.number().min(0).max(30).default(0),
  notes: z.string().nullable().optional(),
})

const DOMAIN_COLORS: Record<string, string> = {
  career: '#6366f1',
  wealth: '#f59e0b',
  health: '#22c55e',
  relationships: '#ec4899',
  learning: '#3b82f6',
  legacy: '#8b5cf6',
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { input, name, domainId, priority, scheduledHour, durationMinutes, dayOffset, notes } = parsed.data

  // Build scheduled time if hour provided
  let scheduledAt: Date | null = null
  let scheduledEnd: Date | null = null
  if (scheduledHour !== undefined && scheduledHour !== null) {
    const d = new Date()
    if (dayOffset) d.setDate(d.getDate() + dayOffset)
    d.setHours(scheduledHour, 0, 0, 0)
    const dur = durationMinutes ?? 60
    scheduledAt = d
    scheduledEnd = new Date(d.getTime() + dur * 60 * 1000)
  }

  // Create task in DB
  const task = await prisma.oSTask.create({
    data: {
      userId: auth.userId,
      name,
      domainId: domainId ?? null,
      duration: durationMinutes ?? 60,
      priority,
      scheduledAt,
      scheduledEnd,
      notes: notes ?? null,
    },
  })

  // Sync calendar event if scheduled
  if (scheduledAt && scheduledEnd) {
    await prisma.calendarEvent.create({
      data: {
        userId: auth.userId,
        taskId: task.id,
        title: task.name,
        startAt: scheduledAt,
        endAt: scheduledEnd,
        domainId: domainId ?? null,
        color: domainId ? DOMAIN_COLORS[domainId] : null,
      },
    })
  }

  await prisma.activityLog.create({
    data: {
      userId: auth.userId,
      taskId: task.id,
      action: 'task_created',
      metadata: { source: 'nlp_quick_add', input },
    },
  })

  return NextResponse.json({
    type: 'task',
    task,
    message: buildConfirmationMessage(task, scheduledHour, dayOffset, domainId),
  })
}

function buildConfirmationMessage(
  task: { id: string; name: string },
  scheduledHour: number | null | undefined,
  dayOffset: number,
  domainId: string | null | undefined
): string {
  const parts = [`Added: "${task.name}"`]
  if (domainId) parts.push(`Domain: ${domainId}`)
  if (scheduledHour !== undefined && scheduledHour !== null) {
    const h = scheduledHour
    const ampm = h >= 12 ? 'pm' : 'am'
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
    const day = dayOffset === 1 ? ' tomorrow' : dayOffset > 1 ? ` in ${dayOffset} days` : ''
    parts.push(`Scheduled: ${displayH}${ampm}${day}`)
  }
  return parts.join(' · ')
}
