import { NextResponse } from 'next/server';

// OS-4764: make apex /api/waitlist/count read the same canonical source that
// https://api.8os.ai/api/waitlist/count exposes. Keep the direct Railway
// orchestrator URL as a fallback, but never fall back to local/frontend state.
const WAITLIST_COUNT_URLS = [
  'https://api.8os.ai/api/waitlist/count',
  'https://orchestrator-production-1643.up.railway.app/waitlist/count',
];

// Public waitlist count endpoint — no auth required.
// Used by the social proof counter on /coming-soon and landing page.
// OS-3499: now calls the dedicated /waitlist/count endpoint (no PII) instead
// of /waitlist/stats which is now admin-only.
export async function GET() {
  for (const url of WAITLIST_COUNT_URLS) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) continue;
      const data = await r.json() as { count?: unknown };
      if (typeof data.count === 'number') {
        return NextResponse.json({ count: data.count });
      }
    } catch (err) {
      console.error('Waitlist count proxy error:', url, err);
    }
  }

  return NextResponse.json(
    { error: 'Upstream waitlist count unavailable' },
    { status: 502 },
  );
}
