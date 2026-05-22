import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'

const answerSchema = z.object({
  questionId: z.number().int().min(1).max(10),
  answer: z.enum(['a', 'b', 'c', 'd']),
})

// POST — save a single quiz answer (upsert)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = answerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { questionId, answer } = parsed.data

  await prisma.quizResponse.upsert({
    where: { userId_questionId: { userId: auth.userId, questionId } },
    create: { userId: auth.userId, questionId, answer },
    update: { answer, answeredAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

// GET — return all saved quiz answers for the current user
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const responses = await prisma.quizResponse.findMany({
    where: { userId: auth.userId },
    orderBy: { questionId: 'asc' },
  })

  const answers: Record<number, string> = {}
  for (const r of responses) {
    answers[r.questionId] = r.answer
  }

  return NextResponse.json({ answers })
}
