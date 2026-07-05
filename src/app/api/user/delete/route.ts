import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-auth'
import { prisma } from '@/lib/db/prisma'

const schema = z.object({
  confirmation: z.literal('DELETE'),
})

/** POST /api/user/delete — GDPR right-to-erasure: soft-delete user account */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

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

  const user = await prisma.user.findUnique({ where: { id: auth.userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await prisma.$transaction([
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
    prisma.quizResponse.deleteMany({ where: { userId: user.id } }),
  ])

  return NextResponse.json({ message: 'Account deleted. Sorry to see you go.' })
}
