import { NextRequest, NextResponse } from 'next/server';

// OS-1173: prefer the public api.8os.ai hostname (reachable from Vercel)
// over the ORCHESTRATOR_URL env var, which is set to the unreachable
// http://orchestrator.railway.internal:8000 in production. The env var
// was a stale config from when the proxy ran inside the same Railway
// service mesh; the Next.js app now lives on Vercel and only the public
// hostname works. Fall back to ORCHESTRATOR_URL for any future in-mesh
// deploy, then to the orchestrator-production Railway URL as last resort.
const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.ORCHESTRATOR_URL ||
  'https://api.8os.ai';

// OS-1173: allow the prelaunch /coming-soon landing page to attribute its
// signups (vs the dashboard waitlist form, telegram bot, and 8os.ai homepage).
// Order matters only for the /waitlist/stats attribution histogram.
const ALLOWED_SOURCES = [
  'dashboard',
  'telegram',
  'api',
  'coming-soon',
  'how-it-works',
  'pricing',
  'quiz',
  'homepage',
  'product-hunt',
  'reddit',
  'podcast',
];

// OS-1173: any source not on the list still goes through, but is normalized
// to a slug (e.g. "Morning Brew #42" → "morning-brew-42") so channel
// attribution is preserved while source length stays inside the 64-char
// VARCHAR cap on the waitlist_entries table. The FastAPI backend has its
// own pass that re-applies this normalization.
function normalizeSource(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'dashboard';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (email.length > 254) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const rawSource = typeof body.source === 'string' ? body.source : 'dashboard';
    const source = ALLOWED_SOURCES.includes(rawSource) ? rawSource : normalizeSource(rawSource);

    // OS-1173: forward affiliate_opt_in from the /coming-soon form to the
    // FastAPI orchestrator so the new boolean column captures opt-in
    // alongside email + source. Legacy forms omit the field; the FastAPI
    // schema defaults it to False so existing callers stay unchanged.
    const affiliateOptIn = body.affiliate_opt_in === true;

    // OS-1173: the FastAPI route is /waitlist/join (not /waitlist). The
    // previous proxy posted to /waitlist which returned 404, so the live
    // 8os.ai waitlist form was silently broken and never captured a single
    // signup. Fix the path so the existing form starts working too.
    const orchResponse = await fetch(`${ORCHESTRATOR_URL}/waitlist/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source, affiliate_opt_in: affiliateOptIn }),
    });

    if (orchResponse.status === 409) {
      return NextResponse.json(
        { error: 'Email already on waitlist' },
        { status: 409 }
      );
    }

    // OS-1187: pass through orchestrator 429s with the upstream Retry-After
    // header so the form can back off cleanly. Previously the catch-all below
    // converted 429 to 502 "Failed to join waitlist", which conflated rate
    // limits with real upstream failures and made the smoke probe (OS-1180)
    // body assertion fail 40-60% of the time during legitimate bursts.
    if (orchResponse.status === 429) {
      const retryAfter = orchResponse.headers.get('retry-after');
      const headers: Record<string, string> = {};
      if (retryAfter) headers['Retry-After'] = retryAfter;
      return NextResponse.json(
        { error: 'Rate limit exceeded — please try again in a moment' },
        { status: 429, headers }
      );
    }

    if (!orchResponse.ok) {
      const errBody = await orchResponse.json().catch(() => ({}));
      const detail: string = (errBody as { detail?: string }).detail ?? '';
      // SQLAlchemy unique constraint violation surfaces as 500 with "duplicate key" in detail
      if (detail.toLowerCase().includes('duplicate') || detail.toLowerCase().includes('unique')) {
        return NextResponse.json(
          { error: 'Email already on waitlist' },
          { status: 409 }
        );
      }
      console.error('Orchestrator waitlist error:', orchResponse.status, errBody);
      // OS-1187: distinguish orchestrator 5xx (real upstream issue, e.g.
      // Cloudflare 530 origin error) from network failures below. The
      // orchestrator response was received, so surface its status + detail
      // in the body so the form can show a useful message and the smoke
      // probe can detect the 502 vs 429 vs 200 split.
      return NextResponse.json(
        { error: 'Failed to join waitlist', detail: detail || `orchestrator returned ${orchResponse.status}` },
        { status: 502 }
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
    // OS-1173: distinguish upstream/orchestrator failures from a malformed
    // request body. The catch wraps both `request.json()` and the fetch to
    // the orchestrator, so report the failure accurately so the form can
    // show a useful message.
    console.error('Waitlist proxy error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('JSON')) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Upstream waitlist service unavailable' },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // OS-1173: forward to the live FastAPI /waitlist/stats so the dashboard
  // can render the new coming-soon channel breakdown. Auth boundary is
  // preserved by re-checking ADMIN_SECRET here; the orchestrator also
  // protects /waitlist/stats by default.
  const auth = `Bearer ${adminSecret}`;
  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/waitlist/stats`, {
      headers: { authorization: auth },
      cache: 'no-store',
    });
    if (!r.ok) {
      return NextResponse.json({ count: 0, entries: [] }, { status: 200 });
    }
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ count: 0, entries: [] }, { status: 200 });
  }
}

// OS-1092: forward DELETE /waitlist?id=<entry_id> to the FastAPI
// orchestrator's DELETE /waitlist/entry/{entry_id}. The orchestrator route
// was added in commit a8b0856 and is live on api.8os.ai; the web-dashboard
// proxy was the missing piece. Used by Mira to scrub the two heidi-formtest*
// test rows stuck in production (see [OS-1092]) and for GDPR right-to-erasure.
//
// Auth: same ADMIN_SECRET as GET, but the orchestrator expects an x-api-key
// header. We re-use ADMIN_SECRET for both sides — the orchestrator is
// configured to accept ADMIN_SECRET as a valid API key.
export async function DELETE(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get('id') || searchParams.get('entry_id');
  if (!entryId) {
    return NextResponse.json(
      { error: 'Missing required query param: id' },
      { status: 400 }
    );
  }
  // Defensive: the orchestrator rejects ids that aren't positive integers
  // with 422. Mirror that here so the form shows a clean 400 instead of
  // a raw upstream error body.
  if (!/^[1-9][0-9]*$/.test(entryId)) {
    return NextResponse.json(
      { error: 'Invalid entry id (must be a positive integer)' },
      { status: 400 }
    );
  }

  try {
    const r = await fetch(`${ORCHESTRATOR_URL}/waitlist/entry/${entryId}`, {
      method: 'DELETE',
      headers: { 'x-api-key': adminSecret },
      cache: 'no-store',
    });
    if (r.status === 404) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      );
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Orchestrator DELETE /waitlist/entry error:', r.status, detail);
      return NextResponse.json(
        { error: 'Failed to delete waitlist entry' },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, deleted: entryId });
  } catch (err) {
    console.error('Waitlist proxy DELETE error:', err);
    return NextResponse.json(
      { error: 'Upstream waitlist service unavailable' },
      { status: 502 }
    );
  }
}
