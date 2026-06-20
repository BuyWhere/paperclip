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

// OS-1242: reserved/special-use TLDs the orchestrator's pydantic EmailStr
// rejects with 422 "special-use or reserved name". Verified against live
// api.8os.ai on 2026-06-17. The proxy mirrors the check so reserved-TLD
// input never round-trips to the orchestrator and never wraps as a
// misleading 502 to the form.
//
// Note: `.example` is NOT in the list — pydantic accepts it (the smoke
// probe at scripts/smoke-probe-8os.sh posts to @paperclip.example
// intentionally; that path must keep working). Only the TLDs that
// pydantic's email-validator actually rejects are listed.
const RESERVED_TLDS = new Set([
  'local',       // RFC 6762: mDNS link-local
  'localhost',   // RFC 6761: loopback
  'test',        // RFC 2606: testing
  'invalid',     // RFC 2606: obviously invalid
  'onion',       // RFC 7686: Tor hidden services
]);
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

    // OS-1242: pre-validate reserved/special-use TLDs (RFC 6761 / RFC 2606)
    // at the proxy so reserved-TLD emails return 400 with the same
    // "Invalid email format" shape as other invalid-input cases, instead
    // of being wrapped as 502 "Upstream waitlist service unavailable" by
    // the catch-all error handler below. Real users typing typos like
    // `gmail.local` (a common .com mis-type) used to see a generic
    // server-error page; the orchestrator's pydantic EmailStr rejects
    // them with 422 + a useful detail, and we now catch them client-side
    // to avoid the round-trip and the misleading 502.
    const tld = email.toLowerCase().split('.').pop() ?? '';
    if (RESERVED_TLDS.has(tld)) {
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
      // Pydantic returns `detail` as an array of {msg,...} objects;
      // SQLAlchemy / hand-raised 5xx return a string. Normalize to a
      // string before any string ops so the duplicate-key check below
      // doesn't throw on a non-string detail.
      const detailRaw = (errBody as { detail?: unknown }).detail;
      const detail: string = Array.isArray(detailRaw)
        ? ((detailRaw[0] as { msg?: string } | undefined)?.msg ?? '')
        : typeof detailRaw === 'string'
          ? detailRaw
          : '';
      // SQLAlchemy unique constraint violation surfaces as 500 with "duplicate key" in detail
      if (detail.toLowerCase().includes('duplicate') || detail.toLowerCase().includes('unique')) {
        return NextResponse.json(
          { error: 'Email already on waitlist' },
          { status: 409 }
        );
      }
      // OS-1242: pass through orchestrator 422 (validation) so the form
      // gets a useful 4xx instead of a misleading 502. The pre-validation
      // blocklist above catches reserved TLDs at the proxy, so this
      // branch is a defense-in-depth fallback for any future pydantic
      // rejection (new reserved TLD, deliverability check, etc.) the
      // blocklist doesn't know about.
      if (orchResponse.status === 422) {
        return NextResponse.json(
          {
            error: 'Invalid email format',
            detail: detail || 'Email failed validation',
          },
          { status: 422 }
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

// OS-1239: add DELETE branch so the Vercel proxy forwards row-deletion
// requests to the orchestrator's /waitlist/entry/{entry_id} endpoint
// (restored on api.8os.ai in OS-1237). Required for Mira's test-row
// scrub and any future GDPR right-to-erasure. The orchestrator's
// require_admin gate validates the x-api-key header against
// ADMIN_API_KEY (set on both Vercel and Railway). The proxy refuses
// requests that don't include either a query string `id` or a JSON
// body `id`, and returns the orchestrator's 404 verbatim so admin
// tooling can distinguish missing-vs-actually-deleted.
export async function DELETE(request: NextRequest) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    return NextResponse.json(
      { error: 'Server misconfigured: ADMIN_API_KEY unset' },
      { status: 503 }
    );
  }

  // Accept id from either query string (?id=<uuid>) or JSON body. The
  // query string form is friendlier for browser-based admin tooling.
  const { searchParams } = new URL(request.url);
  let id = searchParams.get('id');

  if (!id) {
    try {
      const body = await request.json();
      if (typeof body?.id === 'string') {
        id = body.id;
      }
    } catch {
      // body wasn't JSON; fall through to the missing-id branch below
    }
  }

  if (!id) {
    return NextResponse.json(
      { error: 'Missing id (?id=<uuid> or {"id": "<uuid>"})' },
      { status: 400 }
    );
  }

  try {
    const orchResponse = await fetch(`${ORCHESTRATOR_URL}/waitlist/entry/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': adminApiKey },
    });

    if (orchResponse.status === 404) {
      // Idempotent: 404 from the orchestrator means "already gone" — admin
      // tooling can treat it as success-or-ambiguous. Forward the 404 so
      // the caller can decide, but the smoke probe treats 404 as a
      // legitimate terminal state (vs 401/500/502 which are real bugs).
      return NextResponse.json(
        { success: false, error: 'Entry not found', id },
        { status: 404 }
      );
    }

    if (orchResponse.status === 401) {
      // Orchestrator rejected our x-api-key (it shouldn't — the value is
      // the same ADMIN_API_KEY on both sides — but if it does, return
      // 401 verbatim so the smoke probe flags it as a config mismatch).
      return NextResponse.json(
        { error: 'Orchestrator rejected admin key' },
        { status: 401 }
      );
    }

    if (!orchResponse.ok) {
      const errBody = await orchResponse.json().catch(() => ({}));
      const detail: string = (errBody as { detail?: string }).detail ?? '';
      console.error('Orchestrator waitlist delete error:', orchResponse.status, errBody);
      return NextResponse.json(
        { error: 'Failed to delete waitlist entry', detail: detail || `orchestrator returned ${orchResponse.status}` },
        { status: 502 }
      );
    }

    const data = await orchResponse.json() as { deleted: boolean; id: string };
    return NextResponse.json({ success: true, deleted: data.deleted, id: data.id });
  } catch (err) {
    console.error('Waitlist delete proxy error:', err);
    return NextResponse.json(
      { error: 'Upstream waitlist service unavailable' },
      { status: 502 }
    );
  }
}
