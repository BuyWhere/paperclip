/**
 * Meta Pixel + CAPI deduped event helper.
 *
 * Generates a single event_id, fires the client-side Pixel event, AND POSTs
 * the same event to /api/meta/capi so Meta can dedupe inside its 48h window.
 *
 * Usage from a client component (e.g. upgrade flow):
 *
 *   import { trackMetaEvent } from '@/lib/meta'
 *
 *   async function onUpgradeSuccess(user: { email: string; id: string }) {
 *     await trackMetaEvent('ProConvert', {
 *       value: 99,
 *       currency: 'USD',
 *       contentName: '8os Pro annual',
 *     }, {
 *       user: { email: user.email, externalId: user.id }
 *     })
 *   }
 *
 * Both calls share the same event_id — that's the dedup key.
 *
 * The server call is best-effort: a network failure here must NOT block the
 * user flow. We swallow the error and log it.
 */

export type MetaEventName = string

export interface MetaCustomData {
  value?: number
  currency?: string
  contentName?: string
  contentCategory?: string
  [key: string]: unknown
}

export interface MetaUserContext {
  email?: string
  externalId?: string
  clientIp?: string
  userAgent?: string
  fbp?: string
  fbc?: string
}

export interface TrackOptions {
  user?: MetaUserContext
  sourceUrl?: string
}

function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : undefined
}

/**
 * Fire a Meta event both client-side (Pixel) and server-side (CAPI) with a
 * shared event_id. Returns the event_id so callers can log it for debugging.
 *
 * Safe to call from the browser. Falls back to a no-op (client-only) when
 * window.metaTrack is not installed yet (e.g. Pixel not configured).
 */
export async function trackMetaEvent(
  eventName: MetaEventName,
  customData: MetaCustomData = {},
  options: TrackOptions = {}
): Promise<string> {
  const eventId = newEventId()

  // 1. Client-side Pixel. window.metaTrack is installed by MetaPixel.tsx; if
  //    the env var isn't set, this is a no-op and we still POST to CAPI in
  //    case the server has the credentials.
  if (typeof window !== 'undefined' && typeof window.metaTrack === 'function') {
    try {
      window.metaTrack(eventName, customData, eventId)
    } catch (err) {
      console.warn('[meta] client track failed', err)
    }
  }

  // 2. Server-side CAPI. Best-effort — never throw to the caller.
  try {
    const userCtx: MetaUserContext = {
      ...(options.user ?? {}),
      userAgent: options.user?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      fbp: options.user?.fbp ?? readCookie('_fbp'),
      fbc: options.user?.fbc ?? readCookie('_fbc'),
    }

    await fetch('/api/meta/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName,
        eventId,
        eventSourceUrl: options.sourceUrl ?? (typeof window !== 'undefined' ? window.location.href : undefined),
        user: userCtx,
        customData,
      }),
      keepalive: true,
    })
  } catch (err) {
    console.warn('[meta] CAPI forward failed', err)
  }

  return eventId
}
