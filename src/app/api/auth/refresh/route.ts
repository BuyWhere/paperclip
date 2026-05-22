import { NextRequest, NextResponse } from 'next/server'
import { verifyRefreshToken } from '@/lib/auth/jwt'
import { revokeSession, rotateSessionTokens } from '@/lib/auth/session'
import { setAuthCookies } from '@/lib/auth/cookies'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('refresh_token')?.value
  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
  }

  let payload
  try {
    payload = await verifyRefreshToken(refreshToken)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 })
  }

  const rotated = await rotateSessionTokens(payload.sessionId)
  if (!rotated) {
    return NextResponse.json({ error: 'Session invalid or revoked' }, { status: 401 })
  }

  if (rotated.session.refreshToken !== refreshToken) {
    await revokeSession(payload.sessionId)
    return NextResponse.json({ error: 'Session invalid or revoked' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  setAuthCookies(res, rotated.accessToken, rotated.refreshToken)
  return res
}
