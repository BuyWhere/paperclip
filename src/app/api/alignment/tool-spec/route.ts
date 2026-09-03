/**
 * GET /api/alignment/tool-spec
 *
 * Returns the OpenAI-style tool specification for the Alignment Engine.
 * This is a static contract describing how agents should call the tool.
 * No authentication required — tool spec is public.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    type: 'function',
    function: {
      name: 'get_alignment',
      description: 'Generate a personalized archetype and goal/plan recommendations based on birth date, time, and personality type. Returns archetype metadata, coaching tone, dashboard tokens, and goal templates.',
      parameters: {
        type: 'object',
        properties: {
          birthDate: {
            type: 'string',
            description: 'Birth date in YYYY-MM-DD format. Valid range: 1900–present.',
            format: 'date',
          },
          birthTime: {
            type: 'string',
            description: 'Birth time in HH:MM (24-hour) format, optional. If provided, the hour pillar (時辰) will be calculated and included in the archetype.',
            format: 'time',
          },
          personalityCode: {
            type: 'string',
            description: 'Personality type code from four dimensions: systematic/intuitive × goal/process.',
            enum: ['sg', 'sp', 'ig', 'ip'],
          },
          estimatedHourIndex: {
            type: 'integer',
            description: 'Estimated hour pillar index (0–11) from time quiz, optional. Used when birth time is unknown but user answered time-of-day questions.',
            minimum: 0,
            maximum: 11,
          },
        },
        required: ['birthDate', 'personalityCode'],
      },
    },
  })
}
