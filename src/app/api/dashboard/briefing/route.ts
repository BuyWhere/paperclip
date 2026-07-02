import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'
import { getDailyInsight } from '@/lib/deepseek/insights'
import { goalTaglineForDomain, type GoalDomain } from '@/lib/goal-taglines'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const userId = auth.userId
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  try {
    const [archetype, goals, todayTasks, upcomingEvents, userProfile] = await Promise.all([
      prisma.archetypeResult.findUnique({ where: { userId } }),
      prisma.goal.findMany({ where: { userId, status: 'active' }, orderBy: { createdAt: 'asc' }, take: 5 }),
      prisma.oSTask.findMany({
        where: {
          userId,
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: { not: 'cancelled' },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.calendarEvent.findMany({
        where: { userId, startAt: { gte: now, lte: new Date(Date.now() + 86400000) } },
        orderBy: { startAt: 'asc' },
        take: 10,
      }),
      prisma.userProfile.findUnique({
        where: { userId },
        select: { birthTimezone: true, dayElement: true, dayPolarity: true, dominantElement: true },
      }),
    ])

    const taglineInput = userProfile && userProfile.dayElement
      ? {
          dayElement: userProfile.dayElement,
          dayPolarity: userProfile.dayPolarity,
          dominantElement: userProfile.dominantElement,
        }
      : null

    const insight = await getDailyInsight(userId, userProfile?.birthTimezone ?? 'UTC')
    const todayDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    return NextResponse.json({
      todayDate,
      archetype: archetype
        ? {
            archetypeId: archetype.archetypeId,
            archetypeName: archetype.archetypeName,
          }
        : null,
      insight,
      todayTasks: todayTasks.map((task) => ({
        id: task.id,
        name: task.name,
        priority: task.priority,
        status: task.status,
        scheduledAt: task.scheduledAt?.toISOString() ?? null,
        duration: task.duration,
      })),
      upcomingEvents: upcomingEvents.map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt.toISOString(),
        color: event.color,
      })),
      goals: goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        domainId: goal.domainId,
        progress: goal.progress,
        tagline: goalTaglineForDomain(taglineInput, goal.domainId as GoalDomain),
      })),
    })
  } catch (error) {
    console.error('[/api/dashboard/briefing GET]', error)
    return NextResponse.json({ error: 'Failed to load your daily briefing.' }, { status: 500 })
  }
}
