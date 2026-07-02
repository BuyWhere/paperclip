/**
 * GET /api/dashboard
 * Returns all data needed to render the dashboard in one request:
 * user, archetype, goals w/ progress, today's tasks ordered by work prefs,
 * metrics, upcoming calendar events.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'
import { orderTasksByWorkPrefs } from '@/lib/scheduling/engine'
import { getWorkPreferences } from '@/lib/work-preferences'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const userId = auth.userId
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)

  const [user, archetype, goalsRaw, todayTasksRaw, workPreferencesRow, settings, upcomingEvents, recentActivity] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, profile: { select: { dayElement: true, dominantElement: true, dayPolarity: true } } },
      }),
      prisma.archetypeResult.findUnique({ where: { userId } }),
      prisma.goal.findMany({
        where: { userId, status: 'active' },
        include: { projects: { select: { id: true, name: true, accepted: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.oSTask.findMany({
        where: { userId, scheduledAt: { gte: todayStart, lte: todayEnd }, status: { not: 'cancelled' } },
        orderBy: { scheduledAt: 'asc' },
      }),
      getWorkPreferences(userId),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.calendarEvent.findMany({
        where: { userId, startAt: { gte: now, lte: weekEnd } },
        orderBy: { startAt: 'asc' },
        take: 10,
      }),
      prisma.activityLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, action: true, metadata: true, createdAt: true, goalId: true, taskId: true },
      }),
    ])

  // Order today's tasks by work preferences (working-window fit + priority)
  const todayTasksOrdered = orderTasksByWorkPrefs(
    todayTasksRaw.map((t) => ({
      id: t.id,
      scheduledAt: t.scheduledAt,
      priority: t.priority,
    })),
    workPreferencesRow
  )
  const todayTaskMap = new Map(todayTasksRaw.map((t) => [t.id, t]))
  const todayTasks = todayTasksOrdered.map((t) => todayTaskMap.get(t.id)!)

  // Metrics
  const [completedThisWeek, totalTasks, streakDays] = await Promise.all([
    prisma.oSTask.count({ where: { userId, completedAt: { gte: new Date(now.getTime() - 7 * 86400000) } } }),
    prisma.oSTask.count({ where: { userId } }),
    computeStreak(userId),
  ])

  // Unscheduled tasks (backlog)
  const backlog = await prisma.oSTask.findMany({
    where: { userId, scheduledAt: null, status: 'todo' },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: 5,
  })

  return NextResponse.json({
    user,
    archetype,
    goals: goalsRaw,
    todayTasks,
    backlog,
    workPreferences: workPreferencesRow,
    settings,
    upcomingEvents,
    recentActivity,
    metrics: {
      completedThisWeek,
      totalTasks,
      streakDays,
      activeGoals: goalsRaw.length,
    },
  })
}

async function computeStreak(userId: string): Promise<number> {
  const logs = await prisma.activityLog.findMany({
    where: { userId, action: 'task_completed' },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { createdAt: true },
  })

  if (logs.length === 0) return 0

  const days = new Set(logs.map((l) => l.createdAt.toISOString().slice(0, 10)))
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 60; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (days.has(key)) streak++
    else if (i > 0) break
  }
  return streak
}