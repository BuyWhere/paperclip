import { NextRequest, NextResponse } from 'next/server';

// OS-1394: public GET /api/waitlist/stats handler. Proxies to the Railway
// backend's /waitlist/stats (or Railway internal URL) and strips the entries
// array, exposing only the count. Railway FastAPI uses /waitlist/* (no /api
// prefix) — this route bridges the public Vercel path to the internal one.
const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.ORCHESTRATOR_URL ||
  'https://api.8os.ai';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/waitlist/stats`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch waitlist stats' },
        { status: 502 }
      );
    }
    const data = await r.json() as { count: number; entries?: unknown[] };
    return NextResponse.json({ count: data.count });
  } catch (err) {
    console.error('Waitlist stats proxy error:', err);
    return NextResponse.json(
      { error: 'Upstream waitlist service unavailable' },
      { status: 502 }
    );
  }
}
