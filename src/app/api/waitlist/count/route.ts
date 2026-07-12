import { NextResponse } from 'next/server';

// OS-1722: same fix as waitlist/route.ts — hardcoded Railway URL to avoid
// circular proxy when NEXT_PUBLIC_API_URL is set to api.8os.ai in Vercel.
const ORCHESTRATOR_URL = 'https://orchestrator-production-1643.up.railway.app';

// Public waitlist count endpoint — no auth required.
// Used by the social proof counter on /coming-soon and landing page.
// OS-3499: now calls the dedicated /waitlist/count endpoint (no PII) instead
// of /waitlist/stats which is now admin-only.
export async function GET() {
  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/waitlist/count`, {
      cache: 'no-store',
    });
    if (!r.ok) {
      return NextResponse.json({ count: 0 }, { status: 200 });
    }
    const data = await r.json() as { count?: number };
    return NextResponse.json({ count: data.count ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
