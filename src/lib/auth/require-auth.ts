import { NextRequest, NextResponse } from 'next/server'
import { authenticateAccessToken } from './authenticate'

/**
 * Extract and verify the access token from cookie.
 * Returns { userId } on success, or a NextResponse error to return immediately.
 */
export async function requireAuth(
  req: NextRequest,
): Promise<{ ok: true; userId: string; sessionId: string } | NextResponse> {
  const auth = await authenticateAccessToken(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return { ok: true, userId: auth.payload.sub, sessionId: auth.payload.sessionId }
}
