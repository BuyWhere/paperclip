import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

// Routes that require authentication — everything else is public
const isProtectedRoute = createRouteMatcher([
  '/settings(.*)',
  '/admin(.*)',
  '/dashboard(.*)',
  '/onboarding(.*)',
])

// ─── Security Headers (Task 11) ───────────────────────────────────────────────

const ALLOWED_ORIGIN = process.env.CORS_ALLOWED_ORIGIN ?? 'https://8os.ai'

function applySecurityHeaders(res: NextResponse, req: NextRequest): NextResponse {
  // HSTS — only over HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }

  // Prevent clickjacking
  res.headers.set('X-Frame-Options', 'DENY')

  // Prevent MIME sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff')

  // Referrer policy
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions policy — disable features we don't use
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  )

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com", // unsafe-eval needed for Next.js dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://img.clerk.com",
    "font-src 'self'",
    "connect-src 'self' https://api.deepseek.com https://us.i.posthog.com https://us-assets.i.posthog.com https://orchestrator-production-1643.up.railway.app https://api.8os.ai https://*.clerk.accounts.dev https://*.clerk.com",
    "frame-src https://*.clerk.accounts.dev https://*.clerk.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  res.headers.set('Content-Security-Policy', csp)

  // CORS — whitelist 8os.ai only
  const origin = req.headers.get('origin')
  if (origin === ALLOWED_ORIGIN) {
    res.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
    res.headers.set('Access-Control-Allow-Credentials', 'true')
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With',
    )
  }

  return res
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl

  // OS-1253 fix-forward (OS-1256): handle /en /zh /register at the edge
  // with a proper 307+Location so the redirect cannot be intercepted by
  // the global error boundary at build time. page.tsx stubs stay for
  // build-time coverage; runtime traffic never reaches them.
  if (pathname === '/en' || pathname === '/zh') {
    const res = NextResponse.redirect(new URL('/', req.url), 307)
    return applySecurityHeaders(res, req)
  }
  if (pathname === '/register') {
    const res = NextResponse.redirect(new URL('/signup', req.url), 307)
    return applySecurityHeaders(res, req)
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const preflight = new NextResponse(null, { status: 204 })
    return applySecurityHeaders(preflight, req)
  }

  // Allow static assets and all API routes (API handlers manage their own auth)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/')
  ) {
    const res = NextResponse.next()
    return applySecurityHeaders(res, req)
  }

  if (isProtectedRoute(req)) {
    await auth.protect()
  }

  // RBAC: protect admin paths
  if (pathname.startsWith('/admin')) {
    const { sessionClaims } = await auth()
    const claims = sessionClaims as { metadata?: { role?: string }; publicMetadata?: { role?: string } } | null
    const role = claims?.metadata?.role ?? claims?.publicMetadata?.role
    if (role !== 'admin') {
      const res = NextResponse.redirect(new URL('/dashboard', req.url))
      return applySecurityHeaders(res, req)
    }
  }

  const res = NextResponse.next()
  return applySecurityHeaders(res, req)
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|json)$).*)',
  ],
}
