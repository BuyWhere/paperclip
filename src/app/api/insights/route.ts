/**
 * GET /api/insights  — fetch today's daily insight (generates if not yet cached)
 * POST /api/insights — force-regenerate (admin only, or for testing)
 *
 * Rate limiting: 10 req/min IP + 100/day user
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { getDailyInsight } from '@/lib/deepseek/insights'
import { consumeIpRequest, consumeUserRequest } from '@/lib/auth/rate-limit'
import { captureException } from '@/lib/monitoring/sentry'
import { alert5xx, alertSlowResponse } from '@/lib/monitoring/telegram'
import { prisma } from '@/lib/db/prisma'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

export async function GET(req: NextRequest) {
  const start = Date.now()
  const path = '/api/insights'

  try {
    // Rate limit by IP
    const ip = getClientIp(req)
    try {
      await consumeIpRequest(ip)
    } catch {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Auth
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth

    // Rate limit by user
    try {
      await consumeUserRequest(auth.userId)
    } catch {
      return NextResponse.json({ error: 'Daily request limit reached' }, { status: 429 })
    }

    // Get user timezone from profile
    const profile = await prisma.userProfile.findUnique({
      where: { userId: auth.userId },
      select: { birthTimezone: true },
    })
    const timezone = profile?.birthTimezone ?? 'UTC'

    const result = await getDailyInsight(auth.userId, timezone)

    // Load feedback for today if any
    const insightRecord = await prisma.dailyInsight.findUnique({
      where: { userId_date: { userId: auth.userId, date: result.date } },
      include: { feedback: true },
    })

    const elapsed = Date.now() - start
    alertSlowResponse(path, elapsed)

    return NextResponse.json({
      insight: result.content,
      date: result.date,
      isFallback: result.isFallback,
      cached: result.cached,
      feedback: insightRecord?.feedback?.rating ?? null,
    })
  } catch (err) {
    const elapsed = Date.now() - start
    alertSlowResponse(path, elapsed)
    alert5xx(path, 500, err)
    await captureException(err, { path })
    console.error('[/api/insights GET]', err)
    return NextResponse.json({ error: 'Failed to generate insight' }, { status: 500 })
  }
}
