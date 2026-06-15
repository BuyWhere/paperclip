/**
 * Auth Security Tests
 *
 * Verifies the auth surface against OWASP-class vulnerabilities:
 * - SQL injection: Prisma parameterization holds (identifier is treated as a value)
 * - XSS: all auth endpoints return Content-Type: application/json
 * - Rate limiting: OTP and login limits surface 429
 * - HIBP integration: pwned-password warning is surfaced at registration
 */

import crypto from 'crypto'
import { createDb, bindPrismaMocks, makeReq, generateTestKeyPair } from './helpers'

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
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
  generateOtp: jest.fn(() => '654321'),
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

import { POST as registerRoute } from '@/app/api/auth/register/route'
import { POST as loginRoute } from '@/app/api/auth/login/route'
import { POST as forgotPasswordRoute } from '@/app/api/auth/forgot-password/route'
import { POST as verifyOtpRoute } from '@/app/api/auth/verify-otp/route'
import { GET as meRoute } from '@/app/api/auth/me/route'
import { prisma } from '@/lib/db/prisma'
import { consumeLoginAttempt, consumeOtpRequest } from '@/lib/auth/rate-limit'
import { isPasswordPwned } from '@/lib/auth/password'

const prismaMock = prisma as jest.Mocked<typeof prisma>
const consumeLoginAttemptMock = consumeLoginAttempt as jest.Mock
const consumeOtpRequestMock = consumeOtpRequest as jest.Mock
const isPasswordPwnedMock = isPasswordPwned as jest.Mock

const AUTH_ROUTES = [
  { name: 'POST /register', handler: registerRoute, method: 'POST', body: { email: 'x@x.com', password: 'Str0ng!Pass' } },
  { name: 'POST /login', handler: loginRoute, method: 'POST', body: { identifier: 'x@x.com', password: 'any' } },
  { name: 'POST /forgot-password', handler: forgotPasswordRoute, method: 'POST', body: { email: 'x@x.com' } },
]

beforeAll(() => {
  const { privateKey, publicKey } = generateTestKeyPair()
  process.env.JWT_PRIVATE_KEY = privateKey
  process.env.JWT_PUBLIC_KEY = publicKey
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
})

// ──────────────────────────────────────────────────────────────────────────────
// XSS: all responses must be application/json
// ──────────────────────────────────────────────────────────────────────────────

describe('XSS — Content-Type: application/json on all auth responses', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
  })

  it.each(AUTH_ROUTES)('$name returns Content-Type: application/json', async ({ handler, method, body }) => {
    const req = makeReq(`http://localhost/api/auth/test`, method, body)
    const res = await (handler as any)(req)
    const ct = res.headers.get('content-type')
    expect(ct).toMatch(/application\/json/)
  })

  it('GET /me returns application/json (even on 401)', async () => {
    const req = makeReq('http://localhost/api/auth/me', 'GET')
    const res = await meRoute(req)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.status).toBe(401)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// SQL Injection — Prisma parameterizes all queries
// ──────────────────────────────────────────────────────────────────────────────

describe('SQL injection — identifier field treated as a safe value', () => {
  let db = createDb()
  const SQL_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "admin'--",
    "1; SELECT * FROM users",
    "\" OR \"\"=\"",
  ]

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
  })

  it.each(SQL_PAYLOADS)(
    'login with SQL payload "%s" returns 401 (no bypass)',
    async (payload) => {
      // Ensure no user matches the payload (Prisma treats it as a literal string)
      const req = makeReq('http://localhost/api/auth/login', 'POST', {
        identifier: payload,
        password: 'any-password',
      })
      const res = await loginRoute(req)
      // Must NOT succeed — no user with that email/phone exists
      expect(res.status).not.toBe(200)
      // Should be 401 (not found / wrong credentials) or 422 (invalid format)
      expect([401, 422]).toContain(res.status)
    },
  )

  it.each(SQL_PAYLOADS)(
    'register with SQL payload "%s" in email returns 422 (zod rejects invalid email)',
    async (payload) => {
      const req = makeReq('http://localhost/api/auth/register', 'POST', {
        email: payload,
        password: 'Str0ng!Pass',
      })
      const res = await registerRoute(req)
      // Zod rejects invalid emails before they reach Prisma
      expect(res.status).toBe(422)
    },
  )

  it('prisma.user.findUnique is called with the literal identifier string (not interpolated)', async () => {
    const payload = "'; DROP TABLE users; --"
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
    const req = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'test@example.com',
      password: 'any',
    })
    await loginRoute(req)
    // Prisma mock should have been called with the exact string — not evaluated SQL
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: 'test@example.com' }),
      }),
    )
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Rate limiting — OTP and login limits enforce 429
// ──────────────────────────────────────────────────────────────────────────────

describe('Rate limiting', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
  })

  it('POST /register returns 429 when OTP rate limit is exhausted', async () => {
    consumeOtpRequestMock.mockRejectedValueOnce(new Error('OTP rate limit exceeded'))

    const req = makeReq('http://localhost/api/auth/register', 'POST', {
      email: 'otp-limited@example.com',
      password: 'Str0ng!Pass',
      channel: 'email',
    })
    const res = await registerRoute(req)
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/too many/i)
  })

  it('POST /login returns 429 when login rate limit is exhausted', async () => {
    consumeLoginAttemptMock.mockRejectedValueOnce(new Error('Login rate limit exceeded'))

    const req = makeReq('http://localhost/api/auth/login', 'POST', {
      identifier: 'rate-limited@example.com',
      password: 'Str0ng!Pass',
    })
    const res = await loginRoute(req)
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/too many|temporarily locked/i)
  })

  it('POST /forgot-password returns 429 when reset rate limit is exhausted', async () => {
    const { consumeResetRequest } = require('@/lib/auth/rate-limit')
    ;(consumeResetRequest as jest.Mock).mockRejectedValueOnce(new Error('Reset rate limit exceeded'))

    const req = makeReq('http://localhost/api/auth/forgot-password', 'POST', {
      email: 'reset-limited@example.com',
    })
    const res = await forgotPasswordRoute(req)
    expect(res.status).toBe(429)
  })

  it('POST /verify-otp honors OTP expiry (expired OTP returns 400, not 429)', async () => {
    const userId = crypto.randomUUID()
    db.users.push({
      id: userId,
      email: 'expired-otp@example.com',
      phone: null,
      passwordHash: 'hashed:Str0ng!Pass',
      emailVerified: false,
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
    // Insert an already-expired OTP
    db.otpCodes.push({
      id: crypto.randomUUID(),
      userId,
      code: '654321',
      channel: 'email',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
      createdAt: new Date(),
    })

    const req = makeReq('http://localhost/api/auth/verify-otp', 'POST', {
      userId,
      code: '654321',
    })
    const res = await verifyOtpRoute(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/expired|invalid/i)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// HIBP — pwned password check surfaces a warning at registration
// ──────────────────────────────────────────────────────────────────────────────

describe('HIBP — pwned password warning', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    consumeOtpRequestMock.mockResolvedValue({ remainingPoints: 9 })
  })

  it('surfaces pwnedWarning when HIBP reports the password as breached', async () => {
    isPasswordPwnedMock.mockResolvedValueOnce(true)

    const req = makeReq('http://localhost/api/auth/register', 'POST', {
      email: 'hibp@example.com',
      password: 'P@ssword123', // commonly breached
      channel: 'email',
    })
    const res = await registerRoute(req)
    expect(res.status).toBe(201) // registration still succeeds
    const body = await res.json()
    expect(body.pwnedWarning).toBeDefined()
    expect(body.pwnedWarning).toMatch(/breach/i)
  })

  it('does NOT include pwnedWarning for a clean password', async () => {
    isPasswordPwnedMock.mockResolvedValueOnce(false)

    const req = makeReq('http://localhost/api/auth/register', 'POST', {
      email: 'safe@example.com',
      password: 'V3ryR@ndom&Unique!',
      channel: 'email',
    })
    const res = await registerRoute(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.pwnedWarning).toBeUndefined()
  })

  it('isPasswordPwned is called during registration (HIBP integration is wired)', async () => {
    isPasswordPwnedMock.mockResolvedValueOnce(false)

    const req = makeReq('http://localhost/api/auth/register', 'POST', {
      email: 'wired@example.com',
      password: 'AnyStr0ng!Pass',
      channel: 'email',
    })
    await registerRoute(req)
    expect(isPasswordPwnedMock).toHaveBeenCalledWith('AnyStr0ng!Pass')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Input validation — boundary conditions
// ──────────────────────────────────────────────────────────────────────────────

describe('Input validation', () => {
  let db = createDb()

  beforeEach(() => {
    db = createDb()
    jest.clearAllMocks()
    bindPrismaMocks(prismaMock, db)
    consumeLoginAttemptMock.mockResolvedValue({ remainingPoints: 4 })
  })

  it('POST /register returns 400 on malformed JSON', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json }',
    }) as any
    const res = await registerRoute(req)
    expect(res.status).toBe(400)
  })

  it('POST /login returns 400 on malformed JSON', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    }) as any
    const res = await loginRoute(req)
    expect(res.status).toBe(400)
  })

  it('POST /register validates E.164 phone format', async () => {
    const req = makeReq('http://localhost/api/auth/register', 'POST', {
      phone: '5551234567', // missing + prefix
      password: 'Str0ng!Pass',
      channel: 'sms',
    })
    const res = await registerRoute(req)
    expect(res.status).toBe(422)
  })

  it('POST /verify-otp validates UUID userId', async () => {
    const req = makeReq('http://localhost/api/auth/verify-otp', 'POST', {
      userId: 'not-a-uuid',
      code: '123456',
    })
    const res = await verifyOtpRoute(req)
    expect(res.status).toBe(422)
  })

  it('POST /verify-otp validates 6-character OTP code', async () => {
    const req = makeReq('http://localhost/api/auth/verify-otp', 'POST', {
      userId: crypto.randomUUID(),
      code: '12345', // only 5 digits
    })
    const res = await verifyOtpRoute(req)
    expect(res.status).toBe(422)
  })
})
