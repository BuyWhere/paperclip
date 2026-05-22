import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } },
) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { code: params.code.toLowerCase() },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      defaultCommissionBps: true,
    },
  })

  if (!affiliate || affiliate.status !== 'active') {
    return NextResponse.json({ valid: false }, { status: 404 })
  }

  return NextResponse.json({
    valid: true,
    affiliate,
  })
}
