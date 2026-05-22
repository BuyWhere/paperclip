import type { NextRequest } from 'next/server'
import { verifyAccessToken, type AccessTokenPayload } from './jwt'
import { isTokenBlacklisted } from '@/lib/redis/client'
import { getValidSession } from './session'

type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof getValidSession>>>

export interface AuthenticatedAccessToken {
  token: string
  payload: AccessTokenPayload
  session: AuthenticatedSession
}

export async function authenticateAccessToken(
  req: NextRequest,
): Promise<AuthenticatedAccessToken | null> {
  const token = req.cookies.get('access_token')?.value
  if (!token) return null

  try {
    const payload = await verifyAccessToken(token)
    if (!payload.sub || !payload.jti || !payload.sessionId) return null
    if (await isTokenBlacklisted(payload.jti)) return null

    const session = await getValidSession(payload.sessionId)
    if (!session || session.userId !== payload.sub || session.user.dataDeletedAt) {
      return null
    }

    return { token, payload, session }
  } catch {
    return null
  }
}
