/**
 * POST /api/insights/feedback — submit thumbs up/down for today's insight
 *
 * Body: { rating: 1 | -1 }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { prisma } from '@/lib/db/prisma'
import { consumeIpRequest } from '@/lib/auth/rate-limit'
import { z } from 'zod'

const schema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
})

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

export async function POST(req: NextRequest) {
  // Rate limit by IP
  try {
    await consumeIpRequest(getClientIp(req))
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Auth
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'rating must be 1 or -1' }, { status: 400 })
  }

  const { rating } = parsed.data

  // Find today's insight
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const insight = await prisma.dailyInsight.findFirst({
    where: { userId: auth.userId, date: today },
  })

  if (!insight) {
    return NextResponse.json({ error: 'No insight found for today' }, { status: 404 })
  }

  // Upsert feedback
  await prisma.insightFeedback.upsert({
    where: { insightId: insight.id },
    create: { insightId: insight.id, userId: auth.userId, rating },
    update: { rating },
  })

  return NextResponse.json({ ok: true, rating })
}
