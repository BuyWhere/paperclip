import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, verifyRefreshToken } from '@/lib/auth/jwt'
import { authenticateAccessToken } from '@/lib/auth/authenticate'
import { blacklistToken } from '@/lib/redis/client'
import { revokeSession } from '@/lib/auth/session'
import { clearAuthCookies } from '@/lib/auth/cookies'

export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get('access_token')?.value
  const refreshToken = req.cookies.get('refresh_token')?.value
  const auth = await authenticateAccessToken(req)

  // Blacklist the access token if it's still valid
  if (auth?.payload.exp) {
    const ttl = Math.max(0, auth.payload.exp - Math.floor(Date.now() / 1000))
    if (ttl > 0) await blacklistToken(auth.payload.jti, ttl)
  } else if (accessToken) {
    try {
      const payload = await verifyAccessToken(accessToken)
      if (payload.jti && payload.exp) {
        const ttl = Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
        if (ttl > 0) await blacklistToken(payload.jti, ttl)
      }
    } catch {
      // Token already expired — nothing to blacklist
    }
  }

  // Revoke the session (refresh token)
  if (auth?.payload.sessionId) {
    await revokeSession(auth.payload.sessionId)
  } else if (refreshToken) {
    try {
      const payload = await verifyRefreshToken(refreshToken)
      if (payload.sessionId) {
        await revokeSession(payload.sessionId)
      }
    } catch {
      // Already expired/invalid
    }
  }

  const res = NextResponse.json({ message: 'Logged out' })
  clearAuthCookies(res)
  return res
}
