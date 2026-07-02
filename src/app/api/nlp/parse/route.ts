/**
 * POST /api/nlp/parse
 * Parse natural language input into structured task data WITHOUT creating the task.
 * Returns parsed fields for user confirmation/editing via confirm-chips.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { parseQuickAdd } from '@/lib/nlp/quick-add'
import { z } from 'zod'

const Schema = z.object({ input: z.string().min(1).max(500) })

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const result = parseQuickAdd(parsed.data.input)

  // Drift signals — just return them, no task to confirm
  if (result.driftSignal) {
    return NextResponse.json({
      type: 'drift',
      driftSignal: true,
      emotion: result.driftEmotion,
      parsed: result,
    })
  }

  // Build preview time values for UI
  let previewTime: string | null = null
  let previewEndTime: string | null = null
  let previewDay: string | null = null

  if (result.scheduledHour !== undefined) {
    const d = new Date()
    if (result.dayOffset) {
      d.setDate(d.getDate() + result.dayOffset)
      previewDay = result.dayOffset === 1 ? 'tomorrow' : `in ${result.dayOffset} days`
    } else {
      previewDay = 'today'
    }
    d.setHours(result.scheduledHour, 0, 0, 0)
    const dur = result.durationMinutes ?? 60
    const hours = d.getHours()
    const mins = d.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    const displayH = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
    const displayM = mins === 0 ? '' : `:${mins.toString().padStart(2, '0')}`
    previewTime = `${displayH}${displayM}${ampm}`
    const endDate = new Date(d.getTime() + dur * 60 * 1000)
    const endH = endDate.getHours()
    const endM = endDate.getMinutes()
    const endAmpm = endH >= 12 ? 'pm' : 'am'
    const endDisplayH = endH > 12 ? endH - 12 : endH === 0 ? 12 : endH
    const endDisplayM = endM === 0 ? '' : `:${endM.toString().padStart(2, '0')}`
    previewEndTime = `${endDisplayH}${endDisplayM}${endAmpm}`
  }

  return NextResponse.json({
    type: 'task',
    driftSignal: false,
    parsed: {
      name: result.name,
      domainId: result.domainId ?? null,
      priority: result.priority ?? 'medium',
      scheduledHour: result.scheduledHour ?? null,
      durationMinutes: result.durationMinutes ?? null,
      dayOffset: result.dayOffset ?? 0,
      notes: result.notes ?? null,
    },
    preview: {
      time: previewTime,
      endTime: previewEndTime,
      day: previewDay,
      durationMinutes: result.durationMinutes ?? null,
    },
  })
}
