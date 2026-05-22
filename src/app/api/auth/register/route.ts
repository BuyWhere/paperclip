import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { hashPassword, isPasswordPwned } from '@/lib/auth/password'
import { generateOtp, sendOtp } from '@/lib/auth/otp'
import { consumeOtpRequest, consumeRegistrationRequest } from '@/lib/auth/rate-limit'
import { createSession } from '@/lib/auth/session'
import { setAuthCookies } from '@/lib/auth/cookies'
import { captureServerEvent } from '@/lib/analytics-server'

const schema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone must be E.164 format').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  channel: z.enum(['sms', 'whatsapp', 'email']).default('email'),
}).refine((d) => d.email || d.phone, { message: 'Email or phone required' })

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

  const { email, phone, password, channel } = parsed.data

  // IP-based registration rate limit: 20 registrations per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'

  // CI bypass: skip rate limit when a valid secret header is present (for smoke tests / CI pipelines)
  const ciSecret = process.env.CI_BYPASS_SECRET?.trim()
  const ciHeader = req.headers.get('x-ci-secret')?.trim()
  const isCiBypassed = ciSecret && ciHeader && ciHeader === ciSecret

  if (!isCiBypassed) {
    try {
      await consumeRegistrationRequest(ip)
    } catch {
      return NextResponse.json({ error: 'Too many registrations from this IP, try again later' }, { status: 429 })
    }
  }

  // Check HIBP — warn but don't block (UX decision)
  const pwned = await isPasswordPwned(password)

  // Check duplicate
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        email ? { email } : {},
        phone ? { phone } : {},
      ].filter((o) => Object.keys(o).length > 0),
    },
  })
  if (existing) {
    return NextResponse.json({ error: 'Account already exists' }, { status: 409 })
  }

  const passwordHash = await hashPassword(password)
  const destination = channel === 'email' ? email! : phone!

  // Rate limit OTP sends
  try {
    await consumeOtpRequest(destination)
  } catch {
    return NextResponse.json({ error: 'Too many OTP requests, try again later' }, { status: 429 })
  }

  // Create user (unverified)
  const user = await prisma.user.create({
    data: { email, phone, passwordHash },
  })

  // Generate and send OTP
  const code = generateOtp(6)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      code,
      channel,
      expiresAt,
    },
  })

  // Send OTP best-effort — failure does not block registration
  sendOtp(destination, code, channel).catch((err) => {
    console.error('[register] OTP send failed:', err)
  })

  const ua = req.headers.get('user-agent') ?? undefined
  const { accessToken, refreshToken } = await createSession(user, { ipAddress: ip, userAgent: ua })

  captureServerEvent(user.id, 'user_signed_up', {
    channel,
    has_email: !!email,
    has_phone: !!phone,
    pwned_password: pwned,
  })

  const res = NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        onboardingDone: user.onboardingDone,
      },
      redirectTo: '/onboarding',
      pwnedWarning: pwned
        ? 'This password appears in known data breaches. Consider using a different one.'
        : undefined,
    },
    { status: 201 },
  )

  setAuthCookies(res, accessToken, refreshToken)
  return res
}
