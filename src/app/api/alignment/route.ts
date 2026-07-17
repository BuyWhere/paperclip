/**
 * GET /api/alignment
 *
 * Public alignment engine status endpoint.
 * Used by the owner dogfood gate to verify the alignment route is live.
 * Returns engine availability and archetype dimension summary.
 */

import { NextResponse } from 'next/server'
import { SUN_SIGNS, DAY_MASTER_ROMANIZED, PERSONALITY_TYPES } from '@/lib/archie-engine'

const STRENGTHS = ['strong', 'weak', 'balanced'] as const

export async function GET() {
  try {
    const combinations =
      SUN_SIGNS.length *
      Object.keys(DAY_MASTER_ROMANIZED).length *
      STRENGTHS.length *
      Object.keys(PERSONALITY_TYPES).length

    return NextResponse.json({
      status: 'ok',
      engine: 'archie',
      version: 'v1',
      dimensions: {
        sunSigns: SUN_SIGNS.length,
        dayMasters: Object.keys(DAY_MASTER_ROMANIZED).length,
        strengths: STRENGTHS.length,
        personalityTypes: Object.keys(PERSONALITY_TYPES).length,
      },
      combinations,
    })
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        engine: 'archie',
        error: err instanceof Error ? err.message : 'Alignment engine unavailable',
      },
      { status: 503 },
    )
  }
}
