import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { verifyPasswordResetToken } from '@/lib/auth/jwt'
import { hashPassword, isPasswordPwned } from '@/lib/auth/password'

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
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

  const { token, newPassword } = parsed.data

  let payload
  try {
    payload = await verifyPasswordResetToken(token)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } })
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Reset link already used or expired' }, { status: 400 })
  }

  if (reset.userId !== payload.sub) {
    return NextResponse.json({ error: 'Invalid reset link' }, { status: 400 })
  }

  const pwned = await isPasswordPwned(newPassword)
  const passwordHash = await hashPassword(newPassword)

  await prisma.$transaction([
    prisma.passwordReset.update({ where: { tokenHash }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    }),
    prisma.session.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])

  return NextResponse.json({
    message: 'Password reset successful. You can now log in.',
    pwnedWarning: pwned
      ? 'This password appears in known data breaches. Consider using a stronger one.'
      : undefined,
  })
}
