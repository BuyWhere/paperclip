import { type NextResponse } from 'next/server'

const IS_PROD = process.env.NODE_ENV === 'production'

export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  const base = {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict' as const,
    path: '/',
  }

  res.cookies.set('access_token', accessToken, {
    ...base,
    maxAge: 60 * 15, // 15 minutes
  })

  res.cookies.set('refresh_token', refreshToken, {
    ...base,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/api/auth',
  })
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set('access_token', '', { maxAge: 0, path: '/' })
  res.cookies.set('refresh_token', '', { maxAge: 0, path: '/api/auth' })
}
