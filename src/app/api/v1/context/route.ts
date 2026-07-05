/**
 * GET /api/v1/context
 *
 * Agent Connect: return the authenticated user's working context for agents.
 *
 * Requires: authenticated user session.
 *
 * Returns:
 *   user        identity and account state
 *   profile     non-sensitive operating profile summary
 *   archetype   latest calculated archetype result, if present
 *   goals       active/paused goals for planning context
 *   stats       lightweight counts for downstream prompts
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const [user, profile, archetype, goals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        emailVerified: true,
        phoneVerified: true,
        onboardingDone: true,
        createdAt: true,
      },
    }),
    prisma.userProfile.findUnique({
      where: { userId: auth.userId },
      select: {
        birthTimezone: true,
        gender: true,
        dayMaster: true,
        dayElement: true,
        dayPolarity: true,
        dominantElement: true,
        yearPillar: true,
        monthPillar: true,
        dayPillar: true,
        hourPillar: true,
      },
    }),
    prisma.archetypeResult.findUnique({
      where: { userId: auth.userId },
      select: {
        archetypeId: true,
        archetypeName: true,
        confidence: true,
        dominantElements: true,
        personalityVector: true,
        isHybrid: true,
        hybridSecondary: true,
        updatedAt: true,
      },
    }),
    prisma.goal.findMany({
      where: {
        userId: auth.userId,
        status: { in: ['active', 'paused'] },
      },
      orderBy: [
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        domainId: true,
        name: true,
        definition: true,
        checkMethod: true,
        checkConfig: true,
        status: true,
        progress: true,
      },
    }),
  ])

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      onboardingDone: user.onboardingDone,
      createdAt: user.createdAt,
      linkedProviders: [],
    },
    profile: profile
      ? {
          birthTimezone: profile.birthTimezone,
          gender: profile.gender,
          dayMaster: profile.dayMaster,
          dayElement: profile.dayElement,
          dayPolarity: profile.dayPolarity,
          dominantElement: profile.dominantElement,
          pillars: {
            year: profile.yearPillar,
            month: profile.monthPillar,
            day: profile.dayPillar,
            hour: profile.hourPillar,
          },
        }
      : null,
    archetype,
    goals,
    stats: {
      goalCount: goals.length,
      hasProfile: Boolean(profile),
      hasArchetype: Boolean(archetype),
    },
  })
}
