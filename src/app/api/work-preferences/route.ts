/**
 * GET  /api/work-preferences  → user's WorkPreferences (or defaults)
 * PUT  /api/work-preferences  → upsert WorkPreferences
 *
 * Replaces the old /api/energy endpoint (see OS-2114).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'

const Batching = z.enum(['batch', 'spread'])
const Cadence = z.enum(['daily', 'weekly', 'biweekly'])

const Schema = z.object({
  workingWindowStart: z.number().int().min(0).max(23),
  workingWindowEnd: z.number().int().min(0).max(24),
  blockLengthMin: z.number().int().min(15).max(240),
  batching: Batching,
  planningCadence: Cadence,
})

const DEFAULTS = {
  workingWindowStart: 9,
  workingWindowEnd: 17,
  blockLengthMin: 50,
  batching: 'batch' as const,
  planningCadence: 'weekly' as const,
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const row = await prisma.workPreferences.findUnique({ where: { userId: auth.userId } })
  if (!row) return NextResponse.json({ ...DEFAULTS })

  return NextResponse.json({
    workingWindowStart: row.workingWindowStart,
    workingWindowEnd: row.workingWindowEnd,
    blockLengthMin: row.blockLengthMin,
    batching: row.batching,
    planningCadence: row.planningCadence,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const data = parsed.data
  if (data.workingWindowEnd <= data.workingWindowStart) {
    return NextResponse.json(
      { error: 'workingWindowEnd must be after workingWindowStart' },
      { status: 400 }
    )
  }

  const row = await prisma.workPreferences.upsert({
    where: { userId: auth.userId },
    create: { userId: auth.userId, ...data },
    update: data,
  })

  return NextResponse.json({
    workingWindowStart: row.workingWindowStart,
    workingWindowEnd: row.workingWindowEnd,
    blockLengthMin: row.blockLengthMin,
    batching: row.batching,
    planningCadence: row.planningCadence,
  })
}