'use client'

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

/**
 * Meta Pixel + client-side event tracking.
 *
 * - Loads fbevents.js (Meta Pixel) on every page once NEXT_PUBLIC_META_PIXEL_ID
 *   is set. Bails out cleanly when the env var is missing (e.g. local dev or
 *   pre-pixel deploys) so the app still renders normally.
 * - Fires PageView on every route change.
 * - Exposes window.metaTrack(eventName, params, eventId) so client code can
 *   fire deduped events. The same eventId MUST be sent to the CAPI server
 *   endpoint so Meta can dedup the client and server event within its 48h
 *   window. See src/app/api/meta/capi/route.ts.
 *
 * Env vars:
 *   NEXT_PUBLIC_META_PIXEL_ID (required to enable) — the numeric Pixel ID
 *     from Facebook Business Manager (Data Sources > Pixels).
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
    metaTrack?: (eventName: string, params?: Record<string, unknown>, eventId?: string) => void
  }
}

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

function buildEventId(seed?: string): string {
  // Prefer a caller-supplied eventId so we can dedup against the server-side
  // CAPI event. Fall back to a high-entropy random id for ad-hoc PageView +
  // non-conversion events.
  if (seed) return seed
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function MetaPixelPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return
    const queryString = searchParams?.toString() ?? ''
    const url = window.location.origin + pathname + (queryString ? `?${queryString}` : '')
    // Note: do not pass an eventId here — PageView fires on every navigation,
    // and we don't want to dedup legitimate repeat visits. For deduped events
    // (ProConvert, etc.) the calling code supplies its own eventId.
    window.fbq('track', 'PageView', { page_path: pathname, page_url: url })
  }, [pathname, searchParams])

  return null
}

export function MetaPixel() {
  // No-op when the env var is missing — keeps local dev and pre-pixel
  // deploys clean. Production deploys MUST set NEXT_PUBLIC_META_PIXEL_ID.
  if (!PIXEL_ID) return null

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        // Standard Meta Pixel bootstrap. n.fbq is Meta's own queueing shim.
        dangerouslySetInnerHTML={{
          __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
window.fbq('init', '${PIXEL_ID}');
window.fbq('track', 'PageView');
          `,
        }}
      />
      <Script
        id="meta-pixel-helper"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
(function(){
  // Bridge for client code to fire deduped events.
  // Usage: window.metaTrack('ProConvert', { value: 99, currency: 'USD' }, eventId)
  window.metaTrack = function(eventName, params, eventId){
    try {
      var args = [eventName];
      if (params && typeof params === 'object') args.push(params);
      if (eventId) args.push({ eventID: eventId });
      window.fbq.apply(window, args);
    } catch (err) {
      // Best-effort — never block the user flow on analytics failures.
      if (window.console && console.warn) console.warn('metaTrack failed', err);
    }
  };
})();
          `,
        }}
      />
      <Suspense fallback={null}>
        <MetaPixelPageView />
      </Suspense>
    </>
  )
}

export { buildEventId }
