import { NextRequest, NextResponse } from 'next/server';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ||
  'https://orchestrator-production-1643.up.railway.app';

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
      return NextResponse.json(
        { error: 'Failed to join waitlist' },
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
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
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
