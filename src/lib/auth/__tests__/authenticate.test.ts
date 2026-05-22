import { authenticateAccessToken } from '../authenticate'
import { verifyAccessToken } from '../jwt'
import { isTokenBlacklisted } from '@/lib/redis/client'
import { getValidSession } from '../session'

jest.mock('../jwt', () => ({
  verifyAccessToken: jest.fn(),
}))

jest.mock('@/lib/redis/client', () => ({
  isTokenBlacklisted: jest.fn(),
}))

jest.mock('../session', () => ({
  getValidSession: jest.fn(),
}))

function makeRequest(token = 'access-token') {
  return {
    cookies: {
      get: jest.fn().mockReturnValue(token ? { value: token } : undefined),
    },
  } as any
}

describe('authenticateAccessToken', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('rejects access tokens without a bound sessionId', async () => {
    ;(verifyAccessToken as jest.Mock).mockResolvedValue({
      sub: 'user-1',
      jti: 'jti-1',
      role: 'user',
    })

    await expect(authenticateAccessToken(makeRequest())).resolves.toBeNull()
  })

  it('rejects revoked or missing sessions', async () => {
    ;(verifyAccessToken as jest.Mock).mockResolvedValue({
      sub: 'user-1',
      jti: 'jti-1',
      role: 'user',
      sessionId: 'session-1',
    })
    ;(isTokenBlacklisted as jest.Mock).mockResolvedValue(false)
    ;(getValidSession as jest.Mock).mockResolvedValue(null)

    await expect(authenticateAccessToken(makeRequest())).resolves.toBeNull()
  })

  it('accepts a live session that matches the token subject', async () => {
    ;(verifyAccessToken as jest.Mock).mockResolvedValue({
      sub: 'user-1',
      jti: 'jti-1',
      role: 'user',
      sessionId: 'session-1',
    })
    ;(isTokenBlacklisted as jest.Mock).mockResolvedValue(false)
    ;(getValidSession as jest.Mock).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      user: {
        id: 'user-1',
        role: 'user',
        dataDeletedAt: null,
      },
    })

    await expect(authenticateAccessToken(makeRequest())).resolves.toMatchObject({
      payload: {
        sub: 'user-1',
        sessionId: 'session-1',
      },
      session: {
        id: 'session-1',
      },
    })
  })
})
