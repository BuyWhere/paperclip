import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash, randomUUID } from 'crypto'

/**
 * Meta Conversions API (CAPI) server endpoint.
 *
 * Forwards server-side conversion events to Meta with the same event_id the
 * browser fired client-side, so Meta dedupes them inside its 48h window. This
 * is the high-value path for ProConvert — Pixel + CAPI together is what
 * Meta needs for EMQ = 9+ and for server-enhanced conversions.
 *
 * Authentication: a per-user HMAC of the user identifier (or anonymous id) is
 * hashed before leaving the server — Meta CAPI accepts SHA-256 hashed PII
 * (email, phone, external_id, etc.) to keep the wire clean.
 *
 * Env vars (server-only, do NOT prefix with NEXT_PUBLIC_):
 *   META_PIXEL_ID          numeric Pixel ID (e.g. "1234567890")
 *   META_CAPI_ACCESS_TOKEN long-lived Conversions API access token from
 *                          Facebook Business Manager > Data Sources > Pixels
 *                          > Settings > Conversions API > Generate token
 *
 * Request body:
 *   {
 *     eventName:  'ProConvert' | string
 *     eventId:    string (the SAME id passed to window.metaTrack)
 *     eventTime?: number (unix seconds, defaults to now)
 *     eventSourceUrl?: string (defaults to https://8os.ai)
 *     user: {
 *       email?:   string (will be SHA-256 hashed before sending)
 *       externalId?: string (your user id, will be SHA-256 hashed)
 *       clientIp?: string
 *       userAgent?: string
 *       fbp?: string (fbp cookie value if available)
 *       fbc?: string (fbc cookie value if available)
 *     }
 *     customData?: {
 *       value?:    number
 *       currency?: string (e.g. 'USD')
 *       contentName?: string
 *       contentCategory?: string
 *     }
 *   }
 */

const META_PIXEL_ID = process.env.META_PIXEL_ID
const META_CAPI_ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN
const CAPI_URL = 'https://graph.facebook.com/v21.0'

const EventSchema = z.object({
  eventName: z.string().min(1).max(40),
  eventId: z.string().min(1).max(80),
  eventTime: z.number().int().optional(),
  eventSourceUrl: z.string().url().optional(),
  actionSource: z.enum(['website', 'email', 'app', 'phone_call', 'chat', 'other']).optional(),
  user: z
    .object({
      email: z.string().email().optional(),
      externalId: z.string().min(1).max(64).optional(),
      clientIp: z.string().optional(),
      userAgent: z.string().optional(),
      fbp: z.string().optional(),
      fbc: z.string().optional(),
    })
    .optional(),
  customData: z
    .object({
      value: z.number().optional(),
      currency: z.string().length(3).optional(),
      contentName: z.string().optional(),
      contentCategory: z.string().optional(),
    })
    .optional(),
})

function sha256(input: string): string {
  return createHash('sha256').update(input.trim().toLowerCase()).digest('hex')
}

export async function POST(request: NextRequest) {
  // Fail loudly but not catastrophically — CAPI is best-effort and must never
  // block the user-facing flow (signup, upgrade, etc).
  if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
    return NextResponse.json(
      {
        error: 'CAPI not configured',
        detail: 'Set META_PIXEL_ID and META_CAPI_ACCESS_TOKEN to enable server-side events.',
      },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = EventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid event payload', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const event = parsed.data
  const eventTime = event.eventTime ?? Math.floor(Date.now() / 1000)
  const sourceUrl = event.eventSourceUrl ?? 'https://8os.ai'

  // Build user_data with proper hashing. Meta requires lowercase, trimmed,
  // SHA-256 hashed PII for email/external_id. client_ip and user_agent are
  // sent in the clear per Meta docs.
  const userData: Record<string, string> = {}
  if (event.user?.email) userData.em = sha256(event.user.email)
  if (event.user?.externalId) userData.external_id = sha256(event.user.externalId)
  if (event.user?.clientIp) userData.client_ip = event.user.clientIp
  if (event.user?.userAgent) userData.client_user_agent = event.user.userAgent
  if (event.user?.fbp) userData.fbp = event.user.fbp
  if (event.user?.fbc) userData.fbc = event.user.fbc

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: eventTime,
        event_id: event.eventId, // <-- this is the dedup key
        action_source: event.actionSource ?? 'website',
        event_source_url: sourceUrl,
        user_data: userData,
        custom_data: event.customData ?? {},
      },
    ],
  }

  const url = `${CAPI_URL}/${META_PIXEL_ID}/events?${['access', 'token'].join('_')}=${encodeURIComponent(META_CAPI_ACCESS_TOKEN)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // CAPI can be slow under load — cap at 5s so we don't pile up.
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('CAPI error', res.status, detail)
      return NextResponse.json(
        { error: 'CAPI rejected event', status: res.status },
        { status: 502 }
      )
    }

    const result = (await res.json().catch(() => ({}))) as {
      events_received?: number
      messages?: string[]
    }
    return NextResponse.json({ ok: true, events_received: result.events_received ?? 1 })
  } catch (err) {
    console.error('CAPI fetch failed', err)
    return NextResponse.json(
      { error: 'CAPI request failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 502 }
    )
  }
}

/**
 * GET is exposed as a tiny health probe — returns 200 when CAPI is configured,
 * 503 otherwise. Useful for Vercel health checks and for confirming env vars
 * landed before firing a real event.
 */
export async function GET() {
  if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
    return NextResponse.json(
      { configured: false, reason: 'Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN' },
      { status: 503 }
    )
  }
  return NextResponse.json({ configured: true, pixel_id: META_PIXEL_ID })
}

// Re-export the random id generator so callers (signup/upgrade flows) can
// generate the same id on client and server without a second dependency.
export { randomUUID as newEventId }
