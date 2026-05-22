/**
 * GET   /api/goals/[id]  → goal detail + projects + tasks + activity
 * PATCH /api/goals/[id]  → update progress, status
 * DELETE /api/goals/[id] → archive
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'
import { z } from 'zod'

const UpdateSchema = z.object({
  progress: z.number().min(0).max(1).optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  name: z.string().min(1).max(200).optional(),
  definition: z.string().optional(),
})

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const goal = await prisma.goal.findFirst({
    where: { id: params.id, userId: auth.userId },
    include: {
      projects: {
        include: {
          tasks: {
            where: { status: { not: 'cancelled' } },
            orderBy: [{ priority: 'asc' }, { scheduledAt: 'asc' }],
          },
        },
        orderBy: { suggestedOrder: 'asc' },
      },
      activityLogs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { task: { select: { id: true, name: true } } },
      },
    },
  })

  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Calendar events linked to tasks under this goal
  const taskIds = goal.projects.flatMap((p) => p.tasks.map((t) => t.id))
  const calendarEvents = await prisma.calendarEvent.findMany({
    where: { taskId: { in: taskIds }, userId: auth.userId },
    orderBy: { startAt: 'asc' },
  })

  return NextResponse.json({ ...goal, calendarEvents })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const goal = await prisma.goal.findFirst({ where: { id: params.id, userId: auth.userId } })
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.goal.update({
    where: { id: params.id },
    data: { ...parsed.data, updatedAt: new Date() },
  })

  await prisma.activityLog.create({
    data: {
      userId: auth.userId,
      goalId: goal.id,
      action: 'goal_updated',
      metadata: parsed.data as Record<string, unknown>,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const goal = await prisma.goal.findFirst({ where: { id: params.id, userId: auth.userId } })
  if (!goal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.goal.update({ where: { id: params.id }, data: { status: 'archived' } })
  return NextResponse.json({ ok: true })
}
