import { NextRequest, NextResponse } from 'next/server'

export function requireAdminSecret(req: NextRequest): NextResponse | null {
  const adminSecret = process.env.ADMIN_SECRET
  const authHeader = req.headers.get('authorization')

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
