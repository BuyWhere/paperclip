import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { setAuthCookies } from '@/lib/auth/cookies'
import { consumeLoginAttempt, resetLoginAttempts } from '@/lib/auth/rate-limit'
import { captureServerEvent } from '@/lib/analytics-server'

const schema = z.object({
  identifier: z.string().min(1), // email or phone
  password: z.string().min(1),
})

function isPhone(s: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(s)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { identifier, password } = parsed.data
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown'
  const rateLimitKey = `${identifier}:${ip}`

  // Check rate limit before hitting DB
  try {
    await consumeLoginAttempt(rateLimitKey)
  } catch {
    return NextResponse.json(
      { error: 'Too many failed attempts. Account temporarily locked for 15 minutes.' },
      { status: 429 },
    )
  }

  const where = isPhone(identifier) ? { phone: identifier } : { email: identifier }
  const user = await prisma.user.findUnique({ where })

  // Constant-time-ish: always run bcrypt even if user not found to prevent enumeration
  const dummyHash = '$2a$12$dummy.hash.to.prevent.timing.attacks.in.auth.flow.x'
  const passwordMatch = user
    ? await verifyPassword(password, user.passwordHash ?? dummyHash)
    : (await verifyPassword(password, dummyHash), false)

  if (!user || !passwordMatch) {
    // Track failed attempt in DB too (for lockout display)
    if (user) {
      const lockedUntil = user.failedLoginCount + 1 >= 5
        ? new Date(Date.now() + 15 * 60 * 1000)
        : user.lockedUntil
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: { increment: 1 },
          lockedUntil,
        },
      })
    }
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Check DB-level lockout
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000 / 60)
    return NextResponse.json(
      { error: `Account locked. Try again in ${remaining} minutes.` },
      { status: 423 },
    )
  }

  // Reset failed count on successful login
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  })
  await resetLoginAttempts(rateLimitKey)

  const ua = req.headers.get('user-agent') ?? undefined
  const { accessToken, refreshToken } = await createSession(user, {
    ipAddress: ip,
    userAgent: ua,
  })

  captureServerEvent(user.id, 'user_logged_in', {
    onboarding_done: user.onboardingDone,
    role: user.role,
  })

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      onboardingDone: user.onboardingDone,
    },
    redirectTo: user.onboardingDone ? '/dashboard' : '/onboarding',
  })

  setAuthCookies(res, accessToken, refreshToken)
  return res
}
