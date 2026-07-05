import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

/**
 * Verify the current Clerk session.
 * Returns { userId } on success, or a NextResponse error to return immediately.
 */
export async function requireAuth(
  ..._args: unknown[]
): Promise<{ ok: true; userId: string } | NextResponse> {
  const session = await auth()
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return { ok: true, userId: session.userId }
}
