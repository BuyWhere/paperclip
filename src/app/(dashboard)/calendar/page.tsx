/**
 * /calendar — Calendar Views (Task 8)
 * Day / Week / Month views with scheduling intelligence.
 * Server component fetches events; client component renders the views.
 */
import { prisma } from '@/lib/db/prisma'
import { requireClerkUserId } from '@/lib/auth/clerk'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { QuickAdd } from '@/components/dashboard/QuickAdd'
import { CalendarView } from '@/components/dashboard/CalendarView'
import { getWorkPreferences } from '@/lib/work-preferences'

async function getUserId(): Promise<string> {
  return requireClerkUserId('/calendar')
}

export default async function CalendarPage() {
  const userId = await getUserId()

  const now = new Date()
  const rangeStart = new Date(now)
  rangeStart.setDate(rangeStart.getDate() - 7)
  const rangeEnd = new Date(now)
  rangeEnd.setDate(rangeEnd.getDate() + 60)

  const [goals, calendarEvents, workPreferences, tasks] = await Promise.all([
    prisma.goal.findMany({ where: { userId, status: 'active' }, select: { id: true, domainId: true, name: true, progress: true } }),
    prisma.calendarEvent.findMany({
      where: { userId, startAt: { gte: rangeStart }, endAt: { lte: rangeEnd } },
      include: { task: { select: { id: true, name: true, status: true, priority: true, duration: true } } },
      orderBy: { startAt: 'asc' },
    }),
    getWorkPreferences(userId),
    prisma.oSTask.findMany({
      where: { userId, status: 'todo', scheduledAt: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    }),
  ])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0a' }}>
      <Sidebar goals={goals} />

      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <CalendarView
          events={calendarEvents.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            startAt: e.startAt.toISOString(),
            endAt: e.endAt.toISOString(),
            allDay: e.allDay,
            domainId: e.domainId,
            color: e.color,
            task: e.task ? {
              id: e.task.id,
              name: e.task.name,
              status: e.task.status,
              priority: e.task.priority,
              duration: e.task.duration,
            } : null,
          }))}
          unscheduledTasks={tasks.map((t) => ({
            id: t.id,
            name: t.name,
            duration: t.duration,
            priority: t.priority,
            domainId: t.domainId,
          }))}
          workPreferences={workPreferences}
        />
      </main>

      <QuickAdd />
    </div>
  )
}