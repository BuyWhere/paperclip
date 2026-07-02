/**
 * Scheduling Intelligence Engine
 *
 * Replaces the legacy "energy hours" model (OS-2114). Slots are now picked by:
 *   - Working-window fit (WorkPreferences.workingWindowStart/End)
 *   - Block-length fit (task.duration vs WorkPreferences.blockLengthMin)
 *   - Conflict-free
 *   - Earliest possible time
 *
 * No more `green/yellow/red` energy levels, no `energyMap`, no `energyRequired`.
 */

export interface ScheduledSlot {
  startAt: Date
  endAt: Date
  inWorkingWindow: boolean
  conflictFree: boolean
  blockFit: 'exact' | 'rounded' | 'over'
}

export interface ExistingEvent {
  startAt: Date
  endAt: Date
}

export interface WorkPreferencesLite {
  workingWindowStart: number  // hour 0-23
  workingWindowEnd: number    // hour 0-23
  blockLengthMin: number      // preferred block length in minutes
}

/**
 * Find the best available slot for a task within a date range.
 *
 * Prefers:
 *   1. Conflict-free slots inside the working window
 *   2. Slots that match (or round up to) the user's preferred block length
 *   3. Earliest time
 */
export function findBestSlot(params: {
  durationMinutes: number
  workPreferences: WorkPreferencesLite
  existingEvents: ExistingEvent[]
  searchFrom: Date
  searchDays?: number
}): ScheduledSlot | null {
  const { durationMinutes, workPreferences, existingEvents, searchFrom, searchDays = 7 } = params
  const { workingWindowStart, workingWindowEnd, blockLengthMin } = workPreferences

  const candidates: ScheduledSlot[] = []

  for (let dayOffset = 0; dayOffset < searchDays; dayOffset++) {
    const baseDate = new Date(searchFrom)
    baseDate.setDate(baseDate.getDate() + dayOffset)
    baseDate.setHours(0, 0, 0, 0)

    // Iterate at the user's preferred block cadence inside the working window.
    // Start at workingWindowStart; if the requested duration fits before
    // workingWindowEnd, that's a candidate.
    const startHour = Math.max(0, Math.min(23, workingWindowStart))
    const endHour = Math.max(0, Math.min(24, workingWindowEnd))

    for (let hour = startHour; hour < endHour; hour++) {
      const startAt = new Date(baseDate)
      startAt.setHours(hour, 0, 0, 0)
      const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000)

      // Don't spill past the working window (allow at most blockLengthMin slack)
      const dayEnd = new Date(baseDate)
      dayEnd.setHours(endHour, 0, 0, 0)
      if (endAt.getTime() - dayEnd.getTime() > blockLengthMin * 60 * 1000) continue

      // Skip if in the past
      if (startAt < searchFrom) continue

      // Conflict check
      const conflictFree = !existingEvents.some(
        (e) => startAt < e.endAt && endAt > e.startAt
      )

      const blockFit: ScheduledSlot['blockFit'] =
        durationMinutes === blockLengthMin ? 'exact'
        : durationMinutes <= blockLengthMin ? 'rounded'
        : 'over'

      candidates.push({
        startAt,
        endAt,
        inWorkingWindow: true,
        conflictFree,
        blockFit,
      })
    }
  }

  // Sort: conflict-free first, exact block fit next, then earliest time
  candidates.sort((a, b) => {
    if (a.conflictFree !== b.conflictFree) return a.conflictFree ? -1 : 1
    const fitOrder = { exact: 0, rounded: 1, over: 2 } as const
    const fitDelta = fitOrder[a.blockFit] - fitOrder[b.blockFit]
    if (fitDelta !== 0) return fitDelta
    return a.startAt.getTime() - b.startAt.getTime()
  })

  return candidates[0] ?? null
}

/**
 * Generate recurring task instances from a base task.
 */
export function generateRecurrences(params: {
  baseDate: Date
  rule: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  until: Date
  durationMinutes: number
}): Array<{ startAt: Date; endAt: Date }> {
  const { baseDate, rule, until, durationMinutes } = params
  const results: Array<{ startAt: Date; endAt: Date }> = []
  let current = new Date(baseDate)

  const advance = () => {
    if (rule === 'daily') current.setDate(current.getDate() + 1)
    else if (rule === 'weekly') current.setDate(current.getDate() + 7)
    else if (rule === 'biweekly') current.setDate(current.getDate() + 14)
    else if (rule === 'monthly') current.setMonth(current.getMonth() + 1)
  }

  advance() // skip the base occurrence
  while (current <= until && results.length < 52) {
    const startAt = new Date(current)
    const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000)
    results.push({ startAt, endAt })
    advance()
  }
  return results
}

/**
 * Order tasks for the dashboard "today" view.
 *
 * Replaces `orderTasksByEnergyHours`. Sorts by:
 *   - Tasks scheduled in the working window first
 *   - Then priority desc (high → medium → low)
 *   - Then by scheduled time asc (closest to now first)
 *   - Unscheduled tasks go last (preserves user's intent to plan them)
 */
export function orderTasksByWorkPrefs(
  tasks: Array<{ id: string; scheduledAt: Date | null; priority: string }>,
  workPreferences: WorkPreferencesLite
): typeof tasks {
  const now = new Date()
  const currentHour = now.getHours()

  const priorityRank: Record<string, number> = { high: 3, medium: 2, low: 1 }

  return [...tasks].sort((a, b) => {
    const aInWindow =
      a.scheduledAt != null &&
      a.scheduledAt.getHours() >= workPreferences.workingWindowStart &&
      a.scheduledAt.getHours() < workPreferences.workingWindowEnd
    const bInWindow =
      b.scheduledAt != null &&
      b.scheduledAt.getHours() >= workPreferences.workingWindowStart &&
      b.scheduledAt.getHours() < workPreferences.workingWindowEnd
    if (aInWindow !== bInWindow) return aInWindow ? -1 : 1

    const aPriority = priorityRank[a.priority] ?? 0
    const bPriority = priorityRank[b.priority] ?? 0
    if (aPriority !== bPriority) return bPriority - aPriority

    if (a.scheduledAt && b.scheduledAt) {
      const aDist = Math.abs(a.scheduledAt.getHours() - currentHour)
      const bDist = Math.abs(b.scheduledAt.getHours() - currentHour)
      return aDist - bDist
    }
    if (a.scheduledAt) return -1
    if (b.scheduledAt) return 1
    return 0
  })
}