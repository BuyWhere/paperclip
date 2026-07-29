/**
 * POST /api/alignment/tool-call
 *
 * Executes the alignment_engine tool call: generates a personalized archetype
 * based on birth date, time, and personality type.
 *
 * This is the public, agent-facing entry point — no authentication required.
 * Internal authenticated generation lives at POST /api/v1/archetype/generate
 * with identical behavior.
 *
 * Returns: ArchieResult (full archetype payload)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateArchetype, type PersonalityCode } from '@/lib/archie-engine'

const schema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD'),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  personalityCode: z.enum(['sg', 'sp', 'ig', 'ip']),
  estimatedHourIndex: z.number().int().min(0).max(11).optional().nullable(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { birthDate, birthTime, personalityCode, estimatedHourIndex } = parsed.data

  // Validate birth date is a real calendar date
  const [year, month, day] = birthDate.split('-').map(Number)
  const testDate = new Date(year, month - 1, day)
  if (
    testDate.getFullYear() !== year ||
    testDate.getMonth() + 1 !== month ||
    testDate.getDate() !== day
  ) {
    return NextResponse.json({ error: 'birthDate is not a valid calendar date' }, { status: 422 })
  }

  if (year < 1900 || year > new Date().getFullYear()) {
    return NextResponse.json({ error: 'birthDate year out of supported range (1900–present)' }, { status: 422 })
  }

  try {
    const result = generateArchetype({
      birthDate,
      birthTime: birthTime ?? undefined,
      personalityCode: personalityCode as PersonalityCode,
      estimatedHourIndex: estimatedHourIndex ?? undefined,
    })

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Archetype generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
