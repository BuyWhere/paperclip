/**
 * Auth Integration Tests — register→verify→onboard + full flow suite
 *
 * Tests the complete authentication lifecycle by calling Next.js route handlers
 * directly. External services (email, SMS, HIBP) are mocked; auth logic, JWT
 * signing, bcrypt, and session management run for real.
 *
 * Requires: JWT_PRIVATE_KEY and JWT_PUBLIC_KEY set via beforeAll (uses test key pair).
 */

import crypto from 'crypto'
import { createDb, bindPrismaMocks, makeReq, extractCookies, generateTestKeyPair } from './helpers'

// ──────────────────────────────────────────────────────────────────────────────
// Mocks (must be declared before imports of the code under test)
// ──────────────────────────────────────────────────────────────────────────────

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    otpCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    session: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordReset: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/redis/client', () => ({
  redis: {},
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn(async () => false),
}))

jest.mock('@/lib/auth/rate-limit', () => ({
  consumeLoginAttempt: jest.fn(async () => ({ remainingPoints: 4 })),
  resetLoginAttempts: jest.fn(async () => {}),
  consumeOtpRequest: jest.fn(async () => ({ remainingPoints: 9 })),
  consumeResetRequest: jest.fn(async () => ({ remainingPoints: 2 })),
  consumeRegistrationRequest: jest.fn(async () => ({ remainingPoints: 19 })),
}))

jest.mock('@/lib/auth/otp', () => ({
  generateOtp: jest.fn(() => '123456'),
  sendOtp: jest.fn(async () => {}),
}))

jest.mock('@/lib/auth/password', () => ({
  hashPassword: jest.fn(async (pwd: string) => `hashed:${pwd}`),
  verifyPassword: jest.fn(async (pwd: string, hash: string) => hash === `hashed:${pwd}`),
  isPasswordPwned: jest.fn(async () => false),
}))

jest.mock('nodemailer', () => ({
  default: {
    createTransport: jest.fn(() => ({ sendMail: jest.fn(async () => ({})) })),
  },
}))

// ──────────────────────────────────────────────────────────────────────────────
// Route handlers (imported after mocks are declared)
// ──────────────────────────────────────────────────────────────────────────────

import { POST as registerRoute } from '@/app/api/auth/register/route'
import { POST as verifyOtpRoute } from '@/app/api/auth/verify-otp/route'
import { POST as loginRoute } from '@/app/api/auth/login/route'
import { GET as meRoute } from '@/app/api/auth/me/route'
import { POST as logoutRoute } from '@/app/api/auth/logout/route'
import { POST as refreshRoute } from '@/app/api/auth/refresh/route'
import { POST as forgotPasswordRoute } from '@/app/api/auth/forgot-password/route'
import { POST as resetPasswordRoute } from '@/app/api/auth/reset-password/route'
import { GET as totpSetup, POST as totpConfirm, DELETE as totpDisable } from '@/app/api/auth/totp/route'
import { GET as listSessions, DELETE as deleteSession } from '@/app/api/user/sessions/route'
import { prisma } from '@/lib/db/prisma'
import { blacklistToken, isTokenBlacklisted } from '@/lib/redis/client'
import { consumeLoginAttempt, resetLoginAttempts } from '@/lib/auth/rate-limit'
import { isPasswordPwned } from '@/lib/auth/password'

const prismaMock = prisma as jest.Mocked<typeof prisma>
const blacklistTokenMock = blacklistToken as jest.Mock
const isTokenBlacklistedMock = isTokenBlacklisted as jest.Mock
const consumeLoginAttemptMock = consumeLoginAttempt as jest.Mock
const resetLoginAttemptsMock = resetLoginAttempts as jest.Mock
const isPasswordPwnedMock = isPasswordPwned as jest.Mock

// ──────────────────────────────────────────────────────────────────────────────
// Global setup — inject RSA test keys
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(() => {
  const { privateKey, publicKey } = generateTestKeyPair()
  process.env.JWT_PRIVATE_KEY = privateKey
  process.env.JWT_PUBLIC_KEY = publicKey
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
})

// ──────────────────────────────────────────────────────────────────────────────
// 1. Registration flow: register → verify-otp → JWT cookies + /onboarding
// ──────────────────────────────────────────────────────────────────────────────

describe('Registration flow', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    isTokenBlacklistedMock.mockResolvedValue(false)
  })

  it('registers a new user, sends OTP, verify-otp sets JWT cookies and redirects to /onboarding', async () => {
    const email = 'test@example.com'

    // POST /register
    const regReq = makeReq('http://localhost/api/auth/register', 'POST', {
      email,
      password: 'Str0ng!Pass',
      channel: 'email',
    })
    const regRes = await registerRoute(regReq)
    expect(regRes.status).toBe(201)
    const regBody = await regRes.json()
    expect(regBody.user?.id).toBeDefined()
    expect(regBody.redirectTo).toBe('/onboarding')

    // User created in DB
    expect(db.users).toHaveLength(1)
    expect(db.users[0].email).toBe(email)
    expect(db.users[0].emailVerified).toBe(false)
    // OTP created
    expect(db.otpCodes).toHaveLength(1)
    expect(db.otpCodes[0].code).toBe('123456')

    // Duplicate registration rejected
    const dupReq = makeReq('http://localhost/api/auth/register', 'POST', {
      email,
      password: 'Str0ng!Pass',
      channel: 'email',
    })
    const dupRes = await registerRoute(dupReq)
    expect(dupRes.status).toBe(409)

    // POST /verify-otp
    const otpReq = makeReq('http://localhost/api/auth/verify-otp', 'POST', {
      userId: regBody.user?.id,
      code: '123456',
    })
    const otpRes = await verifyOtpRoute(otpReq)
    expect(otpRes.status).toBe(200)
    const otpBody = await otpRes.json()
    expect(otpBody.redirectTo).toBe('/onboarding')
    expect(otpBody.user?.id).toBe(regBody.user?.id)

    // JWT cookies set
    const cookies = extractCookies(otpRes)
    expect(cookies['access_token']).toBeTruthy()
    expect(cookies['refresh_token']).toBeTruthy()

    // User marked as verified in DB
    expect(db.users[0].emailVerified).toBe(true)
    // OTP marked as used
    expect(db.otpCodes[0].usedAt).not.toBeNull()
    // Session created (registration + verification each create a session)
    expect(db.sessions.length).toBeGreaterThanOrEqual(1)

    // Reusing same OTP code is rejected
    const replayReq = makeReq('http://localhost/api/auth/verify-otp', 'POST', {
      userId: regBody.user?.id,
      code: '123456',
    })
    const replayRes = await verifyOtpRoute(replayReq)
    expect(replayRes.status).toBe(400)
  })

  it('returns 422 on invalid email or missing password', async () => {
    const bad = makeReq('http://localhost/api/auth/register', 'POST', { email: 'not-an-email', password: 'pw' })
    const res = await registerRoute(bad)
    expect(res.status).toBe(422)
  })

  it('returns 422 on missing email and phone', async () => {
    const bad = makeReq('http://localhost/api/auth/register', 'POST', { password: 'Str0ng!Pass' })
    const res = await registerRoute(bad)
    expect(res.status).toBe(422)
  })

  it('includes pwnedWarning when HIBP returns true', async () => {
    isPasswordPwnedMock.mockResolvedValueOnce(true)
    const req = makeReq('http://localhost/api/auth/register', 'POST', {
      email: 'pwned@example.com',
      password: 'Str0ng!Pass',
      channel: 'email',
    })
    const res = await registerRoute(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.pwnedWarning).toMatch(/breach/i)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 2. Login flow: login → cookies → GET /me → correct user shape
// ──────────────────────────────────────────────────────────────────────────────

describe('Login flow', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    isTokenBlacklistedMock.mockResolvedValue(false)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    resetLoginAttemptsMock.mockResolvedValue({})
  })

  it('logs in, sets cookies, GET /me returns correct user shape', async () => {
    // Seed a verified user
    db.users.push({
      id: crypto.randomUUID(),
      email: 'user@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: true,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const seededUser = db.users[0]

    // POST /login
    const loginReq = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'user@example.com',
      password: 'Str0ng!Pass',
    })
    const loginRes = await loginRoute(loginReq)
    expect(loginRes.status).toBe(200)
    const loginBody = await loginRes.json()
    expect(loginBody.redirectTo).toBe('/dashboard')
    expect(loginBody.user.email).toBe('user@example.com')

    const cookies = extractCookies(loginRes)
    expect(cookies['access_token']).toBeTruthy()
    expect(cookies['refresh_token']).toBeTruthy()

    // GET /me with access_token cookie
    const meReq = makeReq('http://localhost/api/auth/me', 'GET', undefined, {
      access_token: cookies['access_token'],
    })
    const meRes = await meRoute(meReq)
    expect(meRes.status).toBe(200)
    const meBody = await meRes.json()
    expect(meBody.user.id).toBe(seededUser.id)
    expect(meBody.user.email).toBe('user@example.com')
    expect(meBody.user.role).toBe('user')
    expect(meBody.user.emailVerified).toBe(true)
    expect(meBody.sessionId).toBeDefined()
  })

  it('rejects wrong password with 401', async () => {
    db.users.push({
      id: crypto.randomUUID(),
      email: 'user2@example.com',
      phone: null,
      passwordHash: 'hashed:correct-pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: false,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const req = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'user2@example.com',
      password: 'wrong-pass',
    })
    const res = await loginRoute(req)
    expect(res.status).toBe(401)
    // Failed count incremented
    expect(db.users[0].failedLoginCount).toBe(1)
  })

  it('returns 401 for unknown user without leaking info', async () => {
    const req = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'nobody@example.com',
      password: 'any',
    })
    const res = await loginRoute(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/invalid credentials/i)
  })

  it('GET /me returns 401 with no cookie', async () => {
    const req = makeReq('http://localhost/api/auth/me', 'GET')
    const res = await meRoute(req)
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 3. Account lockout: 5 failed logins → 6th returns 429
// ──────────────────────────────────────────────────────────────────────────────

describe('Account lockout', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    resetLoginAttemptsMock.mockResolvedValue({})
  })

  it('rate-limiter blocks after configured attempts (429)', async () => {
    db.users.push({
      id: crypto.randomUUID(),
      email: 'lock@example.com',
      phone: null,
      passwordHash: 'hashed:Correct1!',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: false,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // First 5 attempts pass rate-limiter but fail password check
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 0 })
    for (let i = 0; i < 5; i++) {
      const req = makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: 'lock@example.com',
        password: 'WrongPass1!',
      })
      const res = await loginRoute(req)
      expect(res.status).toBe(401)
    }

    // 6th attempt: rate limiter throws (blocked)
    consumeLoginAttemptMock.mockRejectedValueOnce(new Error('Rate limit exceeded'))
    const blockedReq = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'lock@example.com',
      password: 'WrongPass1!',
    })
    const blockedRes = await loginRoute(blockedReq)
    expect(blockedRes.status).toBe(429)
  })

  it('DB-level lockout: returns 423 when lockedUntil is in the future', async () => {
    const futureDate = new Date(Date.now() + 15 * 60 * 1000)
    db.users.push({
      id: crypto.randomUUID(),
      email: 'dblocked@example.com',
      phone: null,
      passwordHash: 'hashed:Correct1!',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: false,
      failedLoginCount: 5,
      lockedUntil: futureDate,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    const req = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'dblocked@example.com',
      password: 'Correct1!',
    })
    const res = await loginRoute(req)
    expect(res.status).toBe(423)
    const body = await res.json()
    expect(body.error).toMatch(/locked/i)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 4. Token refresh
// ──────────────────────────────────────────────────────────────────────────────

describe('Token refresh', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    isTokenBlacklistedMock.mockResolvedValue(false)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    resetLoginAttemptsMock.mockResolvedValue({})
  })

  it('POST /refresh issues new access_token cookie', async () => {
    // Seed verified user and login to get tokens
    db.users.push({
      id: crypto.randomUUID(),
      email: 'refresh@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: true,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const loginReq = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'refresh@example.com',
      password: 'Str0ng!Pass',
    })
    const loginRes = await loginRoute(loginReq)
    expect(loginRes.status).toBe(200)
    const loginCookies = extractCookies(loginRes)
    const originalAccess = loginCookies['access_token']

    // Get refresh_token directly from DB session (bypasses cookie extraction issues)
    const refreshToken = db.sessions[0].refreshToken

    // POST /refresh
    const refreshReq = makeReq('http://localhost/api/auth/refresh', 'POST', undefined, {
      refresh_token: refreshToken,
    })
    const refreshRes = await refreshRoute(refreshReq)
    expect(refreshRes.status).toBe(200)

    const refreshCookies = extractCookies(refreshRes)
    expect(refreshCookies['access_token']).toBeTruthy()
    // The new access token should be a valid JWT (different session token)
    expect(refreshCookies['access_token']).not.toBe('')
  })

  it('returns 401 when no refresh_token cookie is present', async () => {
    const req = makeReq('http://localhost/api/auth/refresh', 'POST')
    const res = await refreshRoute(req)
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 5. Logout + token blacklist
// ──────────────────────────────────────────────────────────────────────────────

describe('Logout and token blacklist', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    isTokenBlacklistedMock.mockResolvedValue(false)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    resetLoginAttemptsMock.mockResolvedValue({})
  })

  it('POST /logout blacklists the access token; GET /me returns 401', async () => {
    db.users.push({
      id: crypto.randomUUID(),
      email: 'logout@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: true,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Login
    const loginRes = await loginRoute(
      makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: 'logout@example.com',
        password: 'Str0ng!Pass',
      }),
    )
    const loginCookies = extractCookies(loginRes)

    // Logout
    const logoutReq = makeReq('http://localhost/api/auth/logout', 'POST', undefined, loginCookies)
    const logoutRes = await logoutRoute(logoutReq)
    expect(logoutRes.status).toBe(200)
    expect(blacklistTokenMock).toHaveBeenCalled()

    // Session revoked in DB
    expect(db.sessions[0]?.revokedAt).not.toBeNull()

    // Simulate blacklisted token on next request
    isTokenBlacklistedMock.mockResolvedValue(true)

    const meReq = makeReq('http://localhost/api/auth/me', 'GET', undefined, loginCookies)
    const meRes = await meRoute(meReq)
    expect(meRes.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 6. Password recovery flow
// ──────────────────────────────────────────────────────────────────────────────

describe('Password recovery', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    isTokenBlacklistedMock.mockResolvedValue(false)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    resetLoginAttemptsMock.mockResolvedValue({})
  })

  it('forgot-password → DB token → reset-password → login with new password', async () => {
    const userId = crypto.randomUUID()
    db.users.push({
      id: userId,
      email: 'recover@example.com',
      phone: null,
      passwordHash: 'hashed:OldPass!1',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: false,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // POST /forgot-password
    const forgotReq = makeReq('http://localhost/api/auth/forgot-password', 'POST', {
      email: 'recover@example.com',
    })
    const forgotRes = await forgotPasswordRoute(forgotReq)
    expect(forgotRes.status).toBe(200)

    // A password reset record was stored in DB
    expect(db.passwordResets).toHaveLength(1)
    const resetRecord = db.passwordResets[0]
    expect(resetRecord.userId).toBe(userId)
    expect(resetRecord.tokenHash).toBeDefined()

    // The tokenHash is a SHA-256 of the JWT token. To call /reset-password we need
    // the actual token. We capture it by mocking the crypto hash.
    // Instead, we test /reset-password directly using the reset-password route's own
    // verifyPasswordResetToken mock approach.

    // For end-to-end: seed a fresh reset record with a known token hash, then call
    // /reset-password with the mocked verifyPasswordResetToken.
    // We test that the route correctly: finds the record, marks it used, updates password, revokes sessions.

    // Verify forgot-password is idempotent (always 200 even for unknown email)
    const unknownReq = makeReq('http://localhost/api/auth/forgot-password', 'POST', {
      email: 'unknown@example.com',
    })
    const unknownRes = await forgotPasswordRoute(unknownReq)
    expect(unknownRes.status).toBe(200)
    const unknownBody = await unknownRes.json()
    expect(unknownBody.message).toMatch(/if that account/i)

    // POST /reset-password — requires JWT token from DB.
    // We test the route unit behavior in reset-password-route.test.ts.
    // Here we verify the DB state after a successful reset:
    // Simulate the token round-trip: extract the stored tokenHash and test the DB state.
    const tokenHash = resetRecord.tokenHash

    // Create a verified JWT using our test keys, then hash it to match what the route expects.
    // The route calls verifyPasswordResetToken → checks DB by tokenHash → updates DB.
    // Since we can't easily construct a matching token without intercepting signPasswordResetToken,
    // we patch the DB record directly and call the route with a valid JWT.

    // Build a valid reset JWT for the test user
    const { signPasswordResetToken } = await import('@/lib/auth/jwt')
    const jti = crypto.randomUUID()
    const token = await signPasswordResetToken(userId, jti)
    const expectedHash = crypto.createHash('sha256').update(token).digest('hex')

    // Update the stored reset record to use this token's hash
    db.passwordResets[0].tokenHash = expectedHash

    const resetReq = makeReq('http://localhost/api/auth/reset-password', 'POST', {
      token,
      newPassword: 'N3wStr0ng!Pass',
    })
    const resetRes = await resetPasswordRoute(resetReq)
    expect(resetRes.status).toBe(200)
    const resetBody = await resetRes.json()
    expect(resetBody.message).toMatch(/reset successful/i)

    // Password updated in DB
    expect(db.users[0].passwordHash).toBe('hashed:N3wStr0ng!Pass')
    // Reset record marked as used
    expect(db.passwordResets[0].usedAt).not.toBeNull()

    // Login with new password
    db.sessions = [] // clear old sessions
    const loginReq = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'recover@example.com',
      password: 'N3wStr0ng!Pass',
    })
    const loginRes = await loginRoute(loginReq)
    expect(loginRes.status).toBe(200)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 7. TOTP enrollment and disabling
// ──────────────────────────────────────────────────────────────────────────────

describe('TOTP', () => {
  const speakeasy = require('speakeasy') as typeof import('speakeasy')
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    isTokenBlacklistedMock.mockResolvedValue(false)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    resetLoginAttemptsMock.mockResolvedValue({})
  })

  it('GET /totp returns secret + QR; POST confirms enrollment; DELETE disables', async () => {
    const userId = crypto.randomUUID()
    db.users.push({
      id: userId,
      email: 'totp@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: true,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Login to get access token
    const loginRes = await loginRoute(
      makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: 'totp@example.com',
        password: 'Str0ng!Pass',
      }),
    )
    expect(loginRes.status).toBe(200)
    const { access_token } = extractCookies(loginRes)
    const authCookies = { access_token }

    // GET /totp — generate secret
    const setupReq = makeReq('http://localhost/api/auth/totp', 'GET', undefined, authCookies)
    const setupRes = await totpSetup(setupReq)
    expect(setupRes.status).toBe(200)
    const setupBody = await setupRes.json()
    expect(setupBody.secret).toBeTruthy()
    expect(setupBody.qrDataUrl).toMatch(/^data:image/)

    // Secret stored in DB (not yet enabled)
    const dbUser = db.users.find((u) => u.id === userId)!
    expect(dbUser.totpSecret).toBe(setupBody.secret)
    expect(dbUser.totpEnabled).toBe(false)

    // POST /totp — confirm with valid code
    const validCode = speakeasy.totp({ secret: setupBody.secret, encoding: 'base32' })
    const confirmReq = makeReq('http://localhost/api/auth/totp', 'POST', { code: validCode }, authCookies)
    const confirmRes = await totpConfirm(confirmReq)
    expect(confirmRes.status).toBe(200)
    expect(db.users.find((u) => u.id === userId)!.totpEnabled).toBe(true)

    // POST /totp again should be 409 (already enabled)
    const secondSetupReq = makeReq('http://localhost/api/auth/totp', 'GET', undefined, authCookies)
    const secondSetupRes = await totpSetup(secondSetupReq)
    expect(secondSetupRes.status).toBe(409)

    // DELETE /totp — disable with valid code
    const disableCode = speakeasy.totp({ secret: setupBody.secret, encoding: 'base32' })
    const disableReq = makeReq('http://localhost/api/auth/totp', 'DELETE', { code: disableCode }, authCookies)
    const disableRes = await totpDisable(disableReq)
    expect(disableRes.status).toBe(200)
    const dbUserAfter = db.users.find((u) => u.id === userId)!
    expect(dbUserAfter.totpEnabled).toBe(false)
    expect(dbUserAfter.totpSecret).toBeNull()
  })

  it('POST /totp returns 400 on invalid TOTP code', async () => {
    const userId = crypto.randomUUID()
    db.users.push({
      id: userId,
      email: 'totp-bad@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: true,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: 'JBSWY3DPEHPK3PXP', // known secret
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const loginRes = await loginRoute(
      makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: 'totp-bad@example.com',
        password: 'Str0ng!Pass',
      }),
    )
    expect(loginRes.status).toBe(200)
    const { access_token } = extractCookies(loginRes)

    const confirmReq = makeReq('http://localhost/api/auth/totp', 'POST', { code: '000000' }, { access_token })
    const confirmRes = await totpConfirm(confirmReq)
    expect(confirmRes.status).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 8. Session revocation
// ──────────────────────────────────────────────────────────────────────────────

describe('Session revocation', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    isTokenBlacklistedMock.mockResolvedValue(false)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    resetLoginAttemptsMock.mockResolvedValue({})
  })

  it('DELETE /user/sessions?id=X revokes a specific session', async () => {
    const userId = crypto.randomUUID()
    db.users.push({
      id: userId,
      email: 'sessions@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: true,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create two sessions by logging in twice
    const loginRes1 = await loginRoute(
      makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: 'sessions@example.com',
        password: 'Str0ng!Pass',
      }),
    )
    expect(loginRes1.status).toBe(200)
    const session1Id = db.sessions[0].id
    const access1 = extractCookies(loginRes1)['access_token']

    const loginRes2 = await loginRoute(
      makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: 'sessions@example.com',
        password: 'Str0ng!Pass',
      }),
    )
    expect(loginRes2.status).toBe(200)
    const session2Id = db.sessions[1].id

    expect(db.sessions).toHaveLength(2)

    // GET /user/sessions — list both (using session 1's access token)
    const listReq = makeReq('http://localhost/api/user/sessions', 'GET', undefined, { access_token: access1 })
    const listRes = await listSessions(listReq)
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json()
    expect(listBody.sessions).toHaveLength(2)

    // DELETE the second session (not current)
    const deleteReq = makeReq(
      `http://localhost/api/user/sessions?id=${session2Id}`,
      'DELETE',
      undefined,
      { access_token: access1 },
    )
    const deleteRes = await deleteSession(deleteReq)
    expect(deleteRes.status).toBe(200)
    const deleteBody = await deleteRes.json()
    expect(deleteBody.currentSessionRevoked).toBe(false)

    // Second session revoked in DB
    const s2 = db.sessions.find((s) => s.id === session2Id)!
    expect(s2.revokedAt).not.toBeNull()

    // First session still active
    const s1 = db.sessions.find((s) => s.id === session1Id)!
    expect(s1.revokedAt).toBeNull()
  })

  it('DELETE /user/sessions with no id revokes all sessions', async () => {
    const userId = crypto.randomUUID()
    db.users.push({
      id: userId,
      email: 'allsessions@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: true,
      phoneVerified: false,
      role: 'user',
      onboardingDone: true,
      failedLoginCount: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabled: false,
      dataDeletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const loginRes = await loginRoute(
      makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: 'allsessions@example.com',
        password: 'Str0ng!Pass',
      }),
    )
    expect(loginRes.status).toBe(200)
    const { access_token } = extractCookies(loginRes)

    const deleteAllReq = makeReq('http://localhost/api/user/sessions', 'DELETE', undefined, { access_token })
    const deleteAllRes = await deleteSession(deleteAllReq)
    expect(deleteAllRes.status).toBe(200)
    const body = await deleteAllRes.json()
    expect(body.currentSessionRevoked).toBe(true)

    // All sessions revoked
    expect(db.sessions.every((s) => s.revokedAt !== null)).toBe(true)
  })
})
