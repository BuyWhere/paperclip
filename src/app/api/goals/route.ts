/**
 * GET  /api/goals           → list user's goals
 * POST /api/goals           → create a goal
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'
import { z } from 'zod'
import { captureServerEvent } from '@/lib/analytics-server'

const DOMAIN_IDS = ['career', 'wealth', 'health', 'relationships', 'learning', 'legacy'] as const
const CHECK_METHODS = ['binary', 'numeric', 'time', 'streak', 'milestone'] as const

const CreateGoalSchema = z.object({
  domainId: z.enum(DOMAIN_IDS),
  name: z.string().min(1).max(200),
  definition: z.string().min(1).max(1000),
  checkMethod: z.enum(CHECK_METHODS),
  checkConfig: z.record(z.unknown()).default({}),
})

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? 'active'

  const goals = await prisma.goal.findMany({
    where: { userId: auth.userId, status: status as 'active' | 'paused' | 'completed' | 'archived' },
    include: {
      projects: { include: { tasks: { where: { status: { not: 'cancelled' } } } } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(goals)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const parsed = CreateGoalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const goal = await prisma.goal.create({
    data: { ...parsed.data, userId: auth.userId },
  })

  await prisma.activityLog.create({
    data: { userId: auth.userId, goalId: goal.id, action: 'goal_created', metadata: { name: goal.name } },
  })

  captureServerEvent(auth.userId, 'goal_created', {
    domain_id: goal.domainId,
    check_method: goal.checkMethod,
  })

  return NextResponse.json(goal, { status: 201 })
}
