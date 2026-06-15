/**
 * GET /api/v1/archetype
 *
 * Returns the catalogue of available archetype dimensions:
 *   sunSigns       — 12 solar sign keys and names
 *   dayMasters     — 10 BaZi day master stems (romanised)
 *   strengths      — 3 day-master strength levels
 *   personalityTypes — 4 MBTI-style codes
 *
 * No authentication required — catalogue is public.
 */

import { NextResponse } from 'next/server'
import { SUN_SIGNS, DAY_MASTER_ROMANIZED, PERSONALITY_TYPES } from '@/lib/archie-engine'

const STRENGTHS = ['strong', 'weak', 'balanced'] as const

export async function GET() {
  return NextResponse.json({
    sunSigns: SUN_SIGNS.map(({ key, name, symbol, element, modality, rulingPlanet, dateRange }) => ({
      key, name, symbol, element, modality, rulingPlanet, dateRange,
    })),
    dayMasters: Object.entries(DAY_MASTER_ROMANIZED).map(([stem, romanized]) => ({
      stem, romanized,
    })),
    strengths: STRENGTHS,
    personalityTypes: Object.entries(PERSONALITY_TYPES).map(([code, { dim1, dim2, label }]) => ({
      code, label, dimensions: { dim1, dim2 },
    })),
    archetypeIdFormat: '{sun_sign_key}_{day_master_romanized}_{strength}_{personality_code}',
    example: 'capricorn_geng_strong_sg',
  })
}
