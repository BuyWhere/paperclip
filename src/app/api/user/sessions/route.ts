import { NextRequest, NextResponse } from 'next/server'
import { authenticateAccessToken } from '@/lib/auth/authenticate'
import { blacklistToken } from '@/lib/redis/client'
import { prisma } from '@/lib/db/prisma'
import { revokeAllSessions, revokeSession } from '@/lib/auth/session'
import { clearAuthCookies } from '@/lib/auth/cookies'

/** GET /api/user/sessions — list all active sessions for the current user */
export async function GET(req: NextRequest) {
  const auth = await authenticateAccessToken(req)
  if (!auth) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const sessions = await prisma.session.findMany({
    where: { userId: auth.payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      deviceName: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      expiresAt: true,
    },
  })

  return NextResponse.json({
    sessions: sessions.map((session: {
      id: string
      deviceName: string | null
      ipAddress: string | null
      userAgent: string | null
      createdAt: Date
      expiresAt: Date
    }) => ({
      ...session,
      current: session.id === auth.payload.sessionId,
    })),
  })
}

/** DELETE /api/user/sessions — revoke a specific session by id, or all sessions */
export async function DELETE(req: NextRequest) {
  const auth = await authenticateAccessToken(req)
  if (!auth) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('id')

  if (sessionId) {
    // Verify the session belongs to this user
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: auth.payload.sub },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    await revokeSession(sessionId)

    if (sessionId === auth.payload.sessionId && auth.payload.exp) {
      const ttl = Math.max(0, auth.payload.exp - Math.floor(Date.now() / 1000))
      if (ttl > 0) await blacklistToken(auth.payload.jti, ttl)
      const res = NextResponse.json({ message: 'Current session revoked', currentSessionRevoked: true })
      clearAuthCookies(res)
      return res
    }

    return NextResponse.json({ message: 'Session revoked', currentSessionRevoked: false })
  }

  // Revoke all sessions (sign out everywhere)
  await revokeAllSessions(auth.payload.sub)
  if (auth.payload.exp) {
    const ttl = Math.max(0, auth.payload.exp - Math.floor(Date.now() / 1000))
    if (ttl > 0) await blacklistToken(auth.payload.jti, ttl)
  }

  const res = NextResponse.json({ message: 'All sessions revoked', currentSessionRevoked: true })
  clearAuthCookies(res)
  return res
}
