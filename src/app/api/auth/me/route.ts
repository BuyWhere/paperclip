import { NextRequest, NextResponse } from 'next/server'
import { authenticateAccessToken } from '@/lib/auth/authenticate'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const auth = await authenticateAccessToken(req)
  if (!auth) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.sub },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      emailVerified: true,
      phoneVerified: true,
      onboardingDone: true,
      totpEnabled: true,
      createdAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ user, sessionId: auth.payload.sessionId })
}
