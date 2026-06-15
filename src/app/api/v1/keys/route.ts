/**
 * POST /api/v1/keys
 *
 * Agent Connect: issue a long-lived API key for the authenticated user.
 * The key is a signed HS256 JWT using BETTER_AUTH_SECRET.
 *
 * Requires: authenticated session (access_token cookie).
 *
 * Body (optional):
 *   label  string  human-readable name for the key (max 80 chars)
 *   ttlDays number  key lifetime in days (default 365, max 730)
 *
 * Returns:
 *   key        string  the API key (8os_<token>)
 *   label      string  the provided or generated label
 *   expiresAt  string  ISO-8601 expiry timestamp
 *   userId     string  the user this key belongs to
 */

import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-auth'

const schema = z.object({
  label: z.string().trim().max(80).optional(),
  ttlDays: z.number().int().min(1).max(730).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  let body: unknown = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { label = `agent-key-${Date.now()}`, ttlDays = 365 } = parsed.data
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const keyId = uuidv4()
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
  const secretBytes = new TextEncoder().encode(secret)

  const token = await new SignJWT({
    type: 'agent_connect',
    label,
    kid: keyId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(auth.userId)
    .setJti(keyId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .setIssuer('8os')
    .sign(secretBytes)

  return NextResponse.json({
    key: `8os_${token}`,
    label,
    expiresAt: expiresAt.toISOString(),
    userId: auth.userId,
  }, { status: 201 })
}
