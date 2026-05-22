import { createHmac, randomUUID, timingSafeEqual } from 'crypto'

const FLOW_COOKIE_NAME = 'google_oauth_flow'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const IS_PROD = process.env.NODE_ENV === 'production'

type GoogleOauthMode = 'login' | 'link'

interface GoogleFlowPayload {
  provider: 'google'
  mode: GoogleOauthMode
  nonce: string
  next: string
  userId?: string
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  id_token?: string
}

interface GoogleUserInfo {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

function getFlowSecret(): string {
  const secret = process.env.AUTH_FLOW_SECRET
  if (!secret) throw new Error('AUTH_FLOW_SECRET is required for Google OAuth')
  return secret
}

function encodeFlowPayload(payload: GoogleFlowPayload & { exp: number }): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeFlowPayload(value: string): GoogleFlowPayload & { exp: number } {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as GoogleFlowPayload & { exp: number }
}

function signFlowPayload(payload: string): string {
  return createHmac('sha256', getFlowSecret()).update(payload).digest('base64url')
}

export function getGoogleOauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are required')
  }

  return { clientId, clientSecret, redirectUri }
}

export function getGoogleFlowCookieName(): string {
  return FLOW_COOKIE_NAME
}

export function sanitizeNextPath(input: string | null | undefined, fallback = '/dashboard'): string {
  if (!input || !input.startsWith('/') || input.startsWith('//')) return fallback
  return input
}

export async function createGoogleOauthFlowToken(
  mode: GoogleOauthMode,
  next: string,
  userId?: string,
): Promise<{ cookieValue: string; state: string }> {
  const nonce = randomUUID()
  const payload = encodeFlowPayload({
    provider: 'google',
    mode,
    nonce,
    next,
    ...(userId ? { userId } : {}),
    exp: Math.floor(Date.now() / 1000) + 60 * 10,
  })
  const signature = signFlowPayload(payload)

  return { cookieValue: `${payload}.${signature}`, state: nonce }
}

export async function verifyGoogleOauthFlowToken(
  cookieValue: string,
  expectedState: string,
): Promise<GoogleFlowPayload> {
  const [encodedPayload, signature] = cookieValue.split('.')
  if (!encodedPayload || !signature) throw new Error('Invalid OAuth flow token')

  const expectedSignature = signFlowPayload(encodedPayload)
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    throw new Error('Invalid OAuth flow token')
  }

  const payload = decodeFlowPayload(encodedPayload)
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('OAuth flow expired')

  if (
    payload.provider !== 'google' ||
    (payload.mode !== 'login' && payload.mode !== 'link') ||
    typeof payload.nonce !== 'string' ||
    payload.nonce !== expectedState ||
    typeof payload.next !== 'string'
  ) {
    throw new Error('Invalid OAuth flow state')
  }

  return {
    provider: 'google',
    mode: payload.mode,
    nonce: payload.nonce,
    next: sanitizeNextPath(payload.next, '/dashboard'),
    userId: typeof payload.userId === 'string' ? payload.userId : undefined,
  }
}

export function buildGoogleAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getGoogleOauthConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleOauthConfig()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Google token exchange failed: ${details}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Google userinfo fetch failed: ${details}`)
  }

  return response.json() as Promise<GoogleUserInfo>
}

export function getGoogleFlowCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    path: '/api/auth/google',
    maxAge: 60 * 10,
  }
}

export function getGoogleOauthErrorRedirect(next: string, message: string): string {
  const params = new URLSearchParams({
    error: message,
  })
  return `${sanitizeNextPath(next, '/login')}?${params.toString()}`
}

export function getOauthAccountExpiry(expiresInSeconds?: number): Date | undefined {
  if (!expiresInSeconds || expiresInSeconds <= 0) return undefined
  return new Date(Date.now() + expiresInSeconds * 1000)
}
