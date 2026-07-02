import { NextResponse } from 'next/server';

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

// Public stats endpoint — no auth required.
// Railway's /waitlist/stats is unauthenticated (only send-early-access requires admin).
// OS-1865 fix proxied to Railway (was returning 401 from Next.js frontend svc).
// OS-1885: removed ADMIN_SECRET gate that regressed — Railway has no auth on this path.
export async function GET() {
  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/waitlist/stats`, {
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
