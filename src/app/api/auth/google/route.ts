import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/auth/jwt'
import {
  buildGoogleAuthorizationUrl,
  createGoogleOauthFlowToken,
  getGoogleFlowCookieName,
  getGoogleFlowCookieOptions,
  sanitizeNextPath,
} from '@/lib/auth/google'

export async function GET(req: NextRequest) {
  const next = sanitizeNextPath(req.nextUrl.searchParams.get('next'), '/dashboard')
  const requestedMode = req.nextUrl.searchParams.get('mode')
  const mode = requestedMode === 'link' ? 'link' : 'login'

  let userId: string | undefined
  if (mode === 'link') {
    const token = req.cookies.get('access_token')?.value
    if (!token) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('Sign in first to connect Google')}`, req.url))
    }

    try {
      const payload = await verifyAccessToken(token)
      userId = payload.sub
    } catch {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('Session expired. Sign in again to connect Google')}`, req.url))
    }
  }

  const { cookieValue, state } = await createGoogleOauthFlowToken(mode, next, userId)
  const response = NextResponse.redirect(buildGoogleAuthorizationUrl(state))
  response.cookies.set(getGoogleFlowCookieName(), cookieValue, getGoogleFlowCookieOptions())
  return response
}
