/**
 * Shared test helpers for auth integration tests.
 *
 * In-memory database factory that simulates Prisma's shape closely enough
 * for multi-step flow tests without needing a real Postgres or Redis.
 */

import crypto from 'crypto'
import { NextRequest } from 'next/server'

// ──────────────────────────────────────────────────────────────────────────────
// Types (mirrors Prisma schema)
// ──────────────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string
  email: string | null
  phone: string | null
  passwordHash: string | null
  emailVerified: boolean
  phoneVerified: boolean
  role: string
  onboardingDone: boolean
  failedLoginCount: number
  lockedUntil: Date | null
  totpSecret: string | null
  totpEnabled: boolean
  dataDeletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface DbOtpCode {
  id: string
  userId: string
  code: string
  channel: string
  usedAt: Date | null
  expiresAt: Date
  createdAt: Date
}

export interface DbSession {
  id: string
  userId: string
  refreshToken: string
  revokedAt: Date | null
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  deviceName: string | null
  createdAt: Date
}

export interface DbPasswordReset {
  id: string
  userId: string
  tokenHash: string
  usedAt: Date | null
  expiresAt: Date
  createdAt: Date
}

// ──────────────────────────────────────────────────────────────────────────────
// In-memory store
// ──────────────────────────────────────────────────────────────────────────────

export interface InMemoryDb {
  users: DbUser[]
  otpCodes: DbOtpCode[]
  sessions: DbSession[]
  passwordResets: DbPasswordReset[]
}

export function createDb(): InMemoryDb {
  return { users: [], otpCodes: [], sessions: [], passwordResets: [] }
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock binder — sets mock implementations against the given db state
// ──────────────────────────────────────────────────────────────────────────────

export function bindPrismaMocks(prismaMock: jest.Mocked<any>, db: InMemoryDb) {
  const { user, otpCode, session, passwordReset } = prismaMock

  // ── user ──────────────────────────────────────────────────
  user.create.mockImplementation(async ({ data }: any) => {
    const u: DbUser = {
      id: data.id ?? crypto.randomUUID(),
      email: data.email ?? null,
      phone: data.phone ?? null,
      passwordHash: data.passwordHash ?? null,
      emailVerified: data.emailVerified ?? false,
      phoneVerified: data.phoneVerified ?? false,
      role: data.role ?? 'user',
      onboardingDone: data.onboardingDone ?? false,
      failedLoginCount: data.failedLoginCount ?? 0,
      lockedUntil: data.lockedUntil ?? null,
      totpSecret: data.totpSecret ?? null,
      totpEnabled: data.totpEnabled ?? false,
      dataDeletedAt: data.dataDeletedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    db.users.push(u)
    return u
  })

  user.findFirst.mockImplementation(async ({ where }: any) => {
    return db.users.find((u) => matchesWhere(u, where)) ?? null
  })

  user.findUnique.mockImplementation(async ({ where }: any) => {
    return db.users.find((u) => matchesWhere(u, where)) ?? null
  })

  user.findUniqueOrThrow.mockImplementation(async ({ where }: any) => {
    const u = db.users.find((u) => matchesWhere(u, where))
    if (!u) throw new Error('Record not found')
    return u
  })

  user.update.mockImplementation(async ({ where, data }: any) => {
    const idx = db.users.findIndex((u) => matchesWhere(u, where))
    if (idx === -1) throw new Error('Record not found')
    const updated = applyUpdate(db.users[idx], data)
    db.users[idx] = { ...updated, updatedAt: new Date() }
    return db.users[idx]
  })

  user.updateMany.mockImplementation(async ({ where, data }: any) => {
    let count = 0
    db.users.forEach((u, i) => {
      if (matchesWhere(u, where)) {
        db.users[i] = { ...applyUpdate(u, data), updatedAt: new Date() }
        count++
      }
    })
    return { count }
  })

  // ── otpCode ───────────────────────────────────────────────
  otpCode.create.mockImplementation(async ({ data }: any) => {
    const o: DbOtpCode = {
      id: data.id ?? crypto.randomUUID(),
      userId: data.userId,
      code: data.code,
      channel: data.channel,
      usedAt: null,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    }
    db.otpCodes.push(o)
    return o
  })

  otpCode.findFirst.mockImplementation(async ({ where, orderBy }: any) => {
    const matches = db.otpCodes.filter((o) => matchesWhere(o, where))
    if (!matches.length) return null
    if (orderBy?.createdAt === 'desc') matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return matches[0]
  })

  otpCode.update.mockImplementation(async ({ where, data }: any) => {
    const idx = db.otpCodes.findIndex((o) => matchesWhere(o, where))
    if (idx === -1) throw new Error('Record not found')
    db.otpCodes[idx] = { ...applyUpdate(db.otpCodes[idx], data) }
    return db.otpCodes[idx]
  })

  // ── session ───────────────────────────────────────────────
  session.create.mockImplementation(async ({ data }: any) => {
    const s: DbSession = {
      id: data.id ?? crypto.randomUUID(),
      userId: data.userId,
      refreshToken: data.refreshToken,
      revokedAt: null,
      expiresAt: data.expiresAt,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      deviceName: data.deviceName ?? null,
      createdAt: new Date(),
    }
    db.sessions.push(s)
    return s
  })

  session.findFirst.mockImplementation(async ({ where, include }: any) => {
    const s = db.sessions.find((s) => matchesWhere(s, where)) ?? null
    if (s && include?.user) {
      const u = db.users.find((u) => u.id === s.userId)
      return s ? { ...s, user: u } : null
    }
    return s
  })

  session.findMany.mockImplementation(async ({ where, orderBy, select }: any) => {
    let results = db.sessions.filter((s) => matchesWhere(s, where))
    if (orderBy?.createdAt === 'desc') results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    if (select) results = results.map((s) => projectSelect(s, select))
    return results
  })

  session.update.mockImplementation(async ({ where, data }: any) => {
    const idx = db.sessions.findIndex((s) => matchesWhere(s, where))
    if (idx === -1) throw new Error('Record not found')
    db.sessions[idx] = applyUpdate(db.sessions[idx], data)
    return db.sessions[idx]
  })

  session.updateMany.mockImplementation(async ({ where, data }: any) => {
    let count = 0
    db.sessions.forEach((s, i) => {
      if (matchesWhere(s, where)) {
        db.sessions[i] = applyUpdate(s, data)
        count++
      }
    })
    return { count }
  })

  // ── passwordReset ──────────────────────────────────────────
  passwordReset.create.mockImplementation(async ({ data }: any) => {
    const pr: DbPasswordReset = {
      id: data.id ?? crypto.randomUUID(),
      userId: data.userId,
      tokenHash: data.tokenHash,
      usedAt: null,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    }
    db.passwordResets.push(pr)
    return pr
  })

  passwordReset.findUnique.mockImplementation(async ({ where }: any) => {
    return db.passwordResets.find((pr) => matchesWhere(pr, where)) ?? null
  })

  passwordReset.update.mockImplementation(async ({ where, data }: any) => {
    const idx = db.passwordResets.findIndex((pr) => matchesWhere(pr, where))
    if (idx === -1) throw new Error('Record not found')
    db.passwordResets[idx] = applyUpdate(db.passwordResets[idx], data)
    return db.passwordResets[idx]
  })

  passwordReset.updateMany.mockImplementation(async ({ where, data }: any) => {
    let count = 0
    db.passwordResets.forEach((pr, i) => {
      if (matchesWhere(pr, where)) {
        db.passwordResets[i] = applyUpdate(pr, data)
        count++
      }
    })
    return { count }
  })

  // ── $transaction ──────────────────────────────────────────
  prismaMock.$transaction.mockImplementation(async (ops: any) => {
    if (Array.isArray(ops)) return Promise.all(ops)
    return ops(prismaMock)
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Simple where-clause matcher
// ──────────────────────────────────────────────────────────────────────────────

function matchesWhere(record: any, where: any): boolean {
  if (!where) return true
  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(val as any[]).some((clause) => matchesWhere(record, clause))) return false
      continue
    }
    if (key === 'AND') {
      if (!(val as any[]).every((clause) => matchesWhere(record, clause))) return false
      continue
    }
    const rv = record[key]
    if (val === null) {
      if (rv !== null && rv !== undefined) return false
    } else if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
      // Prisma range operators: { gt, gte, lt, lte }
      if ('gt' in val && !(rv > (val as any).gt)) return false
      if ('gte' in val && !(rv >= (val as any).gte)) return false
      if ('lt' in val && !(rv < (val as any).lt)) return false
      if ('lte' in val && !(rv <= (val as any).lte)) return false
      if ('not' in val) {
        const notVal = (val as any).not
        if (notVal === null) { if (rv === null) return false }
        else if (rv === notVal) return false
      }
    } else {
      if (rv !== val) return false
    }
  }
  return true
}

// ──────────────────────────────────────────────────────────────────────────────
// Apply Prisma-style update data (handles { increment: N }, { set: V })
// ──────────────────────────────────────────────────────────────────────────────

function applyUpdate(record: any, data: any): any {
  const result = { ...record }
  for (const [key, val] of Object.entries(data)) {
    if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      if ('increment' in (val as any)) result[key] = (result[key] ?? 0) + (val as any).increment
      else if ('set' in (val as any)) result[key] = (val as any).set
      else result[key] = val
    } else {
      result[key] = val
    }
  }
  return result
}

// ──────────────────────────────────────────────────────────────────────────────
// Project a select clause onto a record
// ──────────────────────────────────────────────────────────────────────────────

function projectSelect(record: any, select: Record<string, boolean>): any {
  const result: any = {}
  for (const [k, v] of Object.entries(select)) {
    if (v) result[k] = record[k]
  }
  return result
}

// ──────────────────────────────────────────────────────────────────────────────
// Request helpers
// ──────────────────────────────────────────────────────────────────────────────

export function makeReq(
  url: string,
  method: string,
  body?: object,
  cookies?: Record<string, string>,
): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (cookies && Object.keys(cookies).length) {
    headers.set('Cookie', Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '))
  }
  // Use NextRequest so req.cookies is properly populated from the Cookie header
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/** Extract all Set-Cookie values from a response.
 *
 * NextResponse stores cookies in its ResponseCookies instance and serializes
 * them to headers only when the response is sent over the network. In Jest tests
 * (no real network layer), headers.entries() may not surface them. We therefore
 * prefer the NextResponse.cookies.getAll() path when available.
 */
export function extractCookies(res: Response): Record<string, string> {
  const cookies: Record<string, string> = {}

  // NextResponse exposes .cookies (ResponseCookies) with a getAll() method
  const resCookies = (res as any).cookies
  if (resCookies && typeof resCookies.getAll === 'function') {
    for (const { name, value } of resCookies.getAll()) {
      cookies[name] = value
    }
    if (Object.keys(cookies).length > 0) return cookies
  }

  // Fallback: iterate Set-Cookie response headers
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      const [nameValue] = value.split(';')
      const eqIdx = nameValue.indexOf('=')
      if (eqIdx !== -1) {
        const name = nameValue.slice(0, eqIdx).trim()
        const val = nameValue.slice(eqIdx + 1).trim()
        cookies[name] = val
      }
    }
  }
  return cookies
}

/** Generate RSA key pair for JWT signing in tests. */
export function generateTestKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { privateKey, publicKey }
}
