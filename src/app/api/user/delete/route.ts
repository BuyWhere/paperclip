import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAccessToken } from '@/lib/auth/authenticate'
import { blacklistToken } from '@/lib/redis/client'
import { verifyPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/db/prisma'
import { clearAuthCookies } from '@/lib/auth/cookies'

const schema = z.object({
  password: z.string().min(1, 'Password required to confirm deletion'),
})

/** POST /api/user/delete — GDPR right-to-erasure: soft-delete user account */
export async function POST(req: NextRequest) {
  const auth = await authenticateAccessToken(req)
  if (!auth) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

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

  const user = await prisma.user.findUnique({ where: { id: auth.payload.sub } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash ?? '')
  if (!passwordOk) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 403 })
  }

  // Blacklist current access token
  if (auth.payload.jti && auth.payload.exp) {
    const ttl = Math.max(0, auth.payload.exp - Math.floor(Date.now() / 1000))
    if (ttl > 0) await blacklistToken(auth.payload.jti, ttl)
  }

  // Soft-delete: anonymize PII, mark dataDeletedAt
  await prisma.$transaction([
    // Revoke all sessions
    prisma.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    }),
    // Anonymize the user record
    prisma.user.update({
      where: { id: user.id },
      data: {
        email: null,
        phone: null,
        passwordHash: null,
        totpSecret: null,
        totpEnabled: false,
        dataDeletedAt: new Date(),
      },
    }),
    // Delete quiz + archetype data
    prisma.quizResponse.deleteMany({ where: { userId: user.id } }),
    prisma.otpCode.deleteMany({ where: { userId: user.id } }),
    prisma.passwordReset.deleteMany({ where: { userId: user.id } }),
    prisma.oauthAccount.deleteMany({ where: { userId: user.id } }),
  ])

  const res = NextResponse.json({ message: 'Account deleted. Sorry to see you go.' })
  clearAuthCookies(res)
  return res
}
