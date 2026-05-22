import { NextRequest, NextResponse } from 'next/server';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ||
  'https://orchestrator-production-1643.up.railway.app';

const ALLOWED_SOURCES = ['dashboard', 'telegram', 'api'];

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
    const source = ALLOWED_SOURCES.includes(rawSource) ? rawSource : 'dashboard';

    const orchResponse = await fetch(`${ORCHESTRATOR_URL}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source }),
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

  // Stats endpoint not yet available on all orchestrator versions — return minimal response
  return NextResponse.json({ count: 0, entries: [] });
}
