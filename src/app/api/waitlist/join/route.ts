import { NextRequest, NextResponse } from 'next/server';

// OS-1945: explicit /api/waitlist/join proxy → orchestrator /waitlist/join.
//
// Background: the original 8os marketing site used Vercel with a
// vercel.json rewrite that mapped /api/waitlist/join →
// orchestrator /waitlist/join. After the frontend moved to a pure
// Railway deploy (no Vercel layer), the rewrite stopped applying and
// the bare /api/waitlist route.ts (../route.ts) became the only proxy
// path. Smoke probes still hit /api/waitlist/join directly — the
// canonical Vercel-target URL — and started 404'ing from the Next.js
// catch-all, even though the orchestrator endpoint is fine.
//
// The dashboard form (ComingSoonForm, WaitlistForm) posts to the bare
// /api/waitlist path, so real user signups weren't broken — but every
// recurrence (OS-1430 → 1469 → 1503 → 1852 → 1866) was about this
// 404. This route keeps the canonical Vercel-target path working so
// smoke probes and any third-party integrations pinning to
// /api/waitlist/join keep passing.
//
// Mirrors ../route.ts (the bare /api/waitlist handler). Same body
// shape, same validation, same orchestrator destination. The bare
// handler is unchanged; Next.js prefers the more-specific static path
// (/api/waitlist/join) over the bare one when both could match.
//
// OS-1722: always use the direct Railway orchestrator URL — not
// api.8os.ai — so the proxy never bounces through the frontend service
// itself.
const ORCHESTRATOR_URL = 'https://orchestrator-production-1643.up.railway.app';

const RESERVED_TLDS = new Set([
  'local',
  'localhost',
  'test',
  'invalid',
  'onion',
]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (email.length > 254) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    const tld = email.toLowerCase().split('.').pop() ?? '';
    if (RESERVED_TLDS.has(tld)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const rawSource = typeof body.source === 'string' ? body.source : 'dashboard';
    const affiliateOptIn = body.affiliate_opt_in === true;

    const orchResponse = await fetch(`${ORCHESTRATOR_URL}/waitlist/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: rawSource, affiliate_opt_in: affiliateOptIn }),
    });

    if (orchResponse.status === 409) {
      return NextResponse.json({ error: 'Email already on waitlist' }, { status: 409 });
    }
    if (orchResponse.status === 429) {
      const retryAfter = orchResponse.headers.get('retry-after');
      const headers: Record<string, string> = {};
      if (retryAfter) headers['Retry-After'] = retryAfter;
      return NextResponse.json(
        { error: 'Rate limit exceeded — please try again in a moment' },
        { status: 429, headers },
      );
    }
    if (!orchResponse.ok) {
      const errBody = await orchResponse.json().catch(() => ({}));
      const detailRaw = (errBody as { detail?: unknown }).detail;
      const detail: string = Array.isArray(detailRaw)
        ? ((detailRaw[0] as { msg?: string } | undefined)?.msg ?? '')
        : typeof detailRaw === 'string'
          ? detailRaw
          : '';
      if (detail.toLowerCase().includes('duplicate') || detail.toLowerCase().includes('unique')) {
        return NextResponse.json({ error: 'Email already on waitlist' }, { status: 409 });
      }
      if (orchResponse.status === 422) {
        return NextResponse.json(
          { error: 'Invalid email format', detail: detail || 'Email failed validation' },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: 'Failed to join waitlist', detail: detail || `orchestrator returned ${orchResponse.status}` },
        { status: 502 },
      );
    }

    const data = await orchResponse.json() as { success: boolean; message: string; position: number; total: number };
    return NextResponse.json({
      success: true,
      message: data.message ?? 'Successfully joined waitlist',
      position: data.position,
      total: data.total,
    });
  } catch (err) {
    console.error('Waitlist /join proxy error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('JSON')) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Upstream waitlist service unavailable' },
      { status: 502 },
    );
  }
}