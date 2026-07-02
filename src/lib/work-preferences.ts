import { prisma } from '@/lib/db/prisma'
import type { WorkPreferences } from './types'

export const DEFAULT_WORK_PREFERENCES: WorkPreferences = {
  workingWindowStart: 9,
  workingWindowEnd: 17,
  blockLengthMin: 50,
  batching: 'batch',
  planningCadence: 'weekly',
}

/**
 * Load a user's WorkPreferences from the DB; fall back to defaults if missing.
 */
export async function getWorkPreferences(userId: string): Promise<WorkPreferences> {
  const row = await prisma.workPreferences.findUnique({ where: { userId } })
  if (!row) return { ...DEFAULT_WORK_PREFERENCES }
  return {
    workingWindowStart: row.workingWindowStart,
    workingWindowEnd: row.workingWindowEnd,
    blockLengthMin: row.blockLengthMin,
    batching: row.batching as WorkPreferences['batching'],
    planningCadence: row.planningCadence as WorkPreferences['planningCadence'],
  }
}
