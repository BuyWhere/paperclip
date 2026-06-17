import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'

// OS-1253: /en /zh /register must respond at the edge with a proper
// 307 + Location header. The build-time redirect() in page.tsx stubs is
// intercepted by the global error boundary and returns 307 with no
// Location header (Vercel edge-cache artifact). middleware.ts handles
// the redirect before the page renders so the header is always present.

function makeRequest(pathname: string, method: 'GET' | 'OPTIONS' = 'GET') {
  const url = `https://8os.ai${pathname}`
  return new NextRequest(url, { method })
}

describe('OS-1253 middleware redirect for /en /zh /register', () => {
  it('redirects /en to / with 307 + Location header', async () => {
    const res = await middleware(makeRequest('/en'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://8os.ai/')
  })

  it('redirects /zh to / with 307 + Location header', async () => {
    const res = await middleware(makeRequest('/zh'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://8os.ai/')
  })

  it('redirects /register to /signup with 307 + Location header', async () => {
    const res = await middleware(makeRequest('/register'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://8os.ai/signup')
  })

  it('does not redirect unrelated paths', async () => {
    // /pricing is a public page, must fall through to NextResponse.next() with 200
    const res = await middleware(makeRequest('/pricing'))
    expect(res.status).toBe(200)
  })

  it('applies security headers to /en redirect response', async () => {
    const res = await middleware(makeRequest('/en'))
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
