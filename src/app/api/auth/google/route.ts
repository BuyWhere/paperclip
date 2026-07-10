import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken } from '@/lib/auth/jwt'
import {
  buildGoogleAuthorizationUrl,
  createGoogleOauthFlowToken,
  getGoogleFlowCookieName,
  getGoogleFlowCookieOptions,
  sanitizeNextPath,
} from '@/lib/auth/google'

// The public-facing origin to use for redirects. In production this is always
// https://8os.ai, but Vercel's edge doesn't always expose the user-facing host
// in req.url when the route runs behind proxies (we've seen it come through as
// https://0.0.0.0:3000). Prefer the explicit env var, which the rest of the
// codebase already uses for email share links and reset URLs.
function getSafeRedirectOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://8os.ai'
}

export async function GET(req: NextRequest) {
  const next = sanitizeNextPath(req.nextUrl.searchParams.get('next'), '/dashboard')
  const requestedMode = req.nextUrl.searchParams.get('mode')
  const mode = requestedMode === 'link' ? 'link' : 'login'

  let userId: string | undefined
  if (mode === 'link') {
    const token = req.cookies.get('access_token')?.value
    if (!token) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('Sign in first to connect Google')}`, getSafeRedirectOrigin()))
    }

    try {
      const payload = await verifyAccessToken(token)
      userId = payload.sub
    } catch {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent('Session expired. Sign in again to connect Google')}`, getSafeRedirectOrigin()))
    }
  }

  try {
    const { cookieValue, state } = await createGoogleOauthFlowToken(mode, next, userId)
    const response = NextResponse.redirect(buildGoogleAuthorizationUrl(state))
    response.cookies.set(getGoogleFlowCookieName(), cookieValue, getGoogleFlowCookieOptions())
    return response
  } catch (err) {
    // Defensive: AUTH_FLOW_SECRET or the three GOOGLE_* env vars are missing
    // in the deployed environment. Surface this as a friendly redirect to /login
    // instead of a generic 500 stack trace.
    console.error('[api/auth/google] OAuth env vars missing or invalid:', err)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent('Google sign-in is temporarily unavailable')}`, getSafeRedirectOrigin()),
      { status: 307 },
    )
  }
}
