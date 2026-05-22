/**
 * GET /api/v1/archetype/{archetype_id}
 *
 * Returns the static definition for a given archetype ID.
 * No authentication required — archetype definitions are public.
 *
 * archetype_id format: {sun_sign}_{day_master}_{strength}_{personality}[_h{n}]
 * Example: capricorn_geng_strong_sg
 *
 * Returns:
 *   id              string  archetype ID
 *   name            string  e.g. "The Mountain Forge"
 *   description     string  narrative description
 *   dashboardTokens object  full color/typography/metaphor/coaching tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { getArchetypeDefinition } from '@/lib/archie-engine'

export async function GET(
  _req: NextRequest,
  { params }: { params: { archetype_id: string } },
) {
  const { archetype_id } = params

  if (!archetype_id || typeof archetype_id !== 'string') {
    return NextResponse.json({ error: 'archetype_id is required' }, { status: 400 })
  }

  // Basic format validation: must have at least 4 underscore-separated segments
  const parts = archetype_id.split('_')
  if (parts.length < 4) {
    return NextResponse.json(
      { error: 'Invalid archetype_id format. Expected: {sun_sign}_{day_master}_{strength}_{personality}' },
      { status: 400 },
    )
  }

  const definition = getArchetypeDefinition(archetype_id)
  if (!definition) {
    return NextResponse.json(
      { error: `Unknown archetype: "${archetype_id}". Check sun_sign and day_master values.` },
      { status: 404 },
    )
  }

  return NextResponse.json(definition)
}
