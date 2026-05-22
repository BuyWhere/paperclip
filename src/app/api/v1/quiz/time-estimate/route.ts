/**
 * POST /api/v1/quiz/time-estimate
 *
 * Score the time quiz to estimate birth hour pillar (時辰).
 * Called when user does not know their birth time.
 *
 * No authentication required — quiz scoring is stateless.
 *
 * Body:
 *   answers: Record<number, "a"|"b"|"c"|"d"|"e"|"f">
 *   — question ID → selected option key
 *
 * Returns:
 *   candidates      ShichenCandidate[]  top 2-3 時辰 options with descriptions
 *   topHour         number              best-estimate hour (0-23)
 *   message         string              user-facing summary
 *   questions       TimeQuizQuestion[]  full question list (for UI rendering)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { scoreTimeQuiz, TIME_QUIZ_QUESTIONS, type TimeQuizAnswers } from '@/lib/time-quiz'

const answerSchema = z.enum(['a', 'b', 'c', 'd', 'e', 'f'])

const schema = z.object({
  answers: z.record(
    z.string().regex(/^\d+$/),
    answerSchema,
  ),
})

// GET — return the quiz questions for UI rendering
export async function GET() {
  return NextResponse.json({ questions: TIME_QUIZ_QUESTIONS })
}

// POST — score answers and return estimated 時辰 candidates
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { answers } = parsed.data

  // Validate at least 3 questions answered
  if (Object.keys(answers).length < 3) {
    return NextResponse.json(
      { error: 'At least 3 quiz answers required for a useful estimate' },
      { status: 422 },
    )
  }

  const typedAnswers: TimeQuizAnswers = {}
  for (const [k, v] of Object.entries(answers)) {
    typedAnswers[parseInt(k)] = v as 'a' | 'b' | 'c' | 'd' | 'e' | 'f'
  }

  const result = scoreTimeQuiz(typedAnswers)

  return NextResponse.json({
    candidates: result.candidates,
    topHour: result.topHour,
    message: result.message,
    // Include top 時辰 index for direct use in /archetype/generate
    estimatedHourIndex: result.candidates[0]?.shichen.index ?? null,
  })
}
