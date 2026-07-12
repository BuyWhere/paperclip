import { NextRequest, NextResponse } from 'next/server';

// OS-1722 / OS-1885: hardcoded Railway URL.
// `https://api.8os.ai` loops back through the broken `8os-proxy` Cloudflare
// Worker (OS-1826/OS-1827 chain) and returns 404 Next.js HTML for /waitlist/stats
// and 502 for /api/waitlist/stats. The raw Railway hostname bypasses the
// CF Worker entirely and reaches the FastAPI orchestrator directly.
const ORCHESTRATOR_URL = 'https://orchestrator-production-1643.up.railway.app';

// OS-1885: force per-request SSR to prevent Vercel ISR from serving stale cache.
// Without `dynamic = 'force-dynamic'`, Next.js ISR caches the entire response
// even when the inner fetch() has cache: 'no-store' — causing count=0 from a
// pre-OS-1792 snapshot to persist indefinitely.
export const dynamic = 'force-dynamic';

// OS-3499: /waitlist/stats returns full PII (emails, sources, archetypes, timestamps)
// and MUST be protected by ADMIN_SECRET. The orchestrator's /waitlist/stats endpoint
// now requires x-api-key; the frontend gate is a defense-in-depth layer so the proxy
// never forwards unauthenticated requests to the backend.
export async function GET(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/waitlist/stats`, {
      headers: { 'x-api-key': adminSecret },
      cache: 'no-store',
    });
    if (!r.ok) {
      return NextResponse.json({ error: 'Upstream error' }, { status: 502 });
    }
    const data = await r.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
