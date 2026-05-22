/**
 * GET /api/og/archetype/:name
 *
 * Returns a 1200x630 OG image for archetype social sharing.
 * archetypeName is the snake_case id (e.g. "strategic_commander").
 */

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import {
  ARCHETYPE_NAMES_BY_ID,
  ARCHETYPE_COLORS,
  ARCHETYPE_ICONS,
  type ArchetypeId,
} from '@/types/archetype'

export const runtime = 'edge'

const VALID_IDS = new Set<string>([
  'strategic_commander',
  'nurturing_creative',
  'harmonizer_guardian',
  'steady_achiever',
  'visionary_builder',
])

const ELEMENT_BY_ID: Record<string, string> = {
  strategic_commander: 'Metal',
  nurturing_creative: 'Wood',
  harmonizer_guardian: 'Fire',
  steady_achiever: 'Earth',
  visionary_builder: 'Fire',
}

const TAGLINE_BY_ID: Record<string, string> = {
  strategic_commander: 'Forge your path with precision',
  nurturing_creative: 'Grow your ideas like a garden',
  harmonizer_guardian: 'Light the way for your circle',
  steady_achiever: 'Build lasting momentum, brick by brick',
  visionary_builder: 'Ignite the possible, inspire the world',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { name: string } },
) {
  const id = params.name?.toLowerCase()

  if (!VALID_IDS.has(id)) {
    return new Response(JSON.stringify({ error: 'Unknown archetype' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const archetypeId = id as ArchetypeId
  const name = ARCHETYPE_NAMES_BY_ID[archetypeId]
  const color = ARCHETYPE_COLORS[name]
  const icon = ARCHETYPE_ICONS[name]
  const element = ELEMENT_BY_ID[id]
  const tagline = TAGLINE_BY_ID[id]

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: color,
            opacity: 0.08,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            filter: 'blur(80px)',
          }}
        />

        {/* 8os branding */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-1px',
            }}
          >
            8OS
          </div>
          <div
            style={{
              fontSize: 14,
              color: '#6b7280',
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            Your Personal OS
          </div>
        </div>

        {/* Element badge */}
        <div
          style={{
            marginBottom: 24,
            padding: '6px 20px',
            borderRadius: 999,
            border: `1px solid ${color}`,
            color: color,
            fontSize: 16,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          {element} Element
        </div>

        {/* Icon */}
        <div style={{ fontSize: 96, marginBottom: 24, display: 'flex' }}>{icon}</div>

        {/* Archetype name */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            letterSpacing: '-2px',
            lineHeight: 1.1,
            display: 'flex',
          }}
        >
          {name}
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 20,
            fontSize: 28,
            color: '#9ca3af',
            textAlign: 'center',
            fontStyle: 'italic',
            display: 'flex',
          }}
        >
          {tagline}
        </div>

        {/* Bottom CTA */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: '#6b7280',
            fontSize: 16,
          }}
        >
          <span>Discover your archetype at</span>
          <span style={{ color: color, fontWeight: 600 }}>8os.ai</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
