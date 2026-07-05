import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { prisma } from '@/lib/db/prisma'

/** GET /api/user/export — GDPR data export (JSON download) */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
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
      updatedAt: true,
      quizResponses: {
        select: { questionId: true, answer: true, answeredAt: true },
      },
      archetypeResult: {
        select: {
          archetypeId: true,
          archetypeName: true,
          confidence: true,
          dominantElements: true,
          personalityVector: true,
          isHybrid: true,
          hybridSecondary: true,
          createdAt: true,
        },
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const exportData = {
    exportedAt: new Date().toISOString(),
    user,
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="8os-data-export-${user.id}.json"`,
    },
  })
}
