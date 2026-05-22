import { generateKeyPairSync } from 'crypto'
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../jwt'

describe('jwt auth tokens', () => {
  beforeAll(() => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    process.env.JWT_PRIVATE_KEY = privateKey
    process.env.JWT_PUBLIC_KEY = publicKey
  })

  it('embeds the session in access tokens', async () => {
    const token = await signAccessToken('user-123', 'admin', 'session-abc')
    const payload = await verifyAccessToken(token)

    expect(payload.sub).toBe('user-123')
    expect(payload.role).toBe('admin')
    expect(payload.sessionId).toBe('session-abc')
    expect(payload.jti).toBeDefined()
  })

  it('embeds the session in refresh tokens', async () => {
    const token = await signRefreshToken('user-123', 'session-abc')
    const payload = await verifyRefreshToken(token)

    expect(payload.sub).toBe('user-123')
    expect(payload.sessionId).toBe('session-abc')
    expect(payload.jti).toBeDefined()
  })
})
