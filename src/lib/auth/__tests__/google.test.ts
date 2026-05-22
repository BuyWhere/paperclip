import { createGoogleOauthFlowToken, sanitizeNextPath, verifyGoogleOauthFlowToken } from '@/lib/auth/google'

describe('google oauth helpers', () => {
  const previousSecret = process.env.AUTH_FLOW_SECRET

  beforeEach(() => {
    process.env.AUTH_FLOW_SECRET = 'test-secret-for-google-oauth'
  })

  afterAll(() => {
    process.env.AUTH_FLOW_SECRET = previousSecret
  })

  it('round trips a signed login flow token', async () => {
    const { cookieValue, state } = await createGoogleOauthFlowToken('login', '/dashboard')
    const payload = await verifyGoogleOauthFlowToken(cookieValue, state)

    expect(payload.mode).toBe('login')
    expect(payload.next).toBe('/dashboard')
    expect(payload.userId).toBeUndefined()
  })

  it('rejects mismatched state', async () => {
    const { cookieValue } = await createGoogleOauthFlowToken('link', '/settings/profile', 'user-123')
    await expect(verifyGoogleOauthFlowToken(cookieValue, 'wrong-state')).rejects.toThrow('Invalid OAuth flow state')
  })

  it('sanitizes unsafe redirect targets', () => {
    expect(sanitizeNextPath('https://evil.example')).toBe('/dashboard')
    expect(sanitizeNextPath('//evil.example')).toBe('/dashboard')
    expect(sanitizeNextPath('/settings/profile')).toBe('/settings/profile')
  })
})
