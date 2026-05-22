import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createSession } from '@/lib/auth/session'
import { setAuthCookies } from '@/lib/auth/cookies'

const schema = z.object({
  userId: z.string().uuid(),
  code: z.string().length(6),
})

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

  const { userId, code } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json({ error: 'Invalid verification' }, { status: 400 })
  }

  // Find the most recent unused OTP
  const otp = await prisma.otpCode.findFirst({
    where: {
      userId,
      code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 })
  }

  // Mark OTP used and verify user
  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        ...(otp.channel === 'email' ? { emailVerified: true } : { phoneVerified: true }),
      },
    }),
  ])

  const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? undefined
  const ua = req.headers.get('user-agent') ?? undefined

  const { accessToken, refreshToken } = await createSession(updatedUser, {
    ipAddress: ip,
    userAgent: ua,
  })

  const res = NextResponse.json({
    user: { id: updatedUser.id, email: updatedUser.email, phone: updatedUser.phone, onboardingDone: updatedUser.onboardingDone },
    redirectTo: updatedUser.onboardingDone ? '/dashboard' : '/onboarding',
  })

  setAuthCookies(res, accessToken, refreshToken)
  return res
}
