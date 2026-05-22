import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireAdminSecret } from '@/lib/auth/admin-secret'
import { createAffiliateCode } from '@/lib/affiliate/service'

const schema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(3).max(32).regex(/^[a-z0-9-]+$/).optional(),
  status: z.enum(['pending', 'active', 'paused']).default('active'),
  defaultCommissionBps: z.number().int().min(1).max(10000).default(3000),
})

export async function POST(req: NextRequest) {
  const unauthorized = requireAdminSecret(req)
  if (unauthorized) return unauthorized

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { email, name, code, status, defaultCommissionBps } = parsed.data
  const affiliateCode = (code ?? await createAffiliateCode(name)).toLowerCase()

  try {
    const affiliate = await prisma.affiliate.create({
      data: {
        email,
        name,
        code: affiliateCode,
        status,
        defaultCommissionBps,
      },
    })

    return NextResponse.json({
      affiliate,
      shareUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://8os.ai'}/ref/${affiliate.code}`,
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      return NextResponse.json({ error: 'Affiliate with this email or code already exists' }, { status: 409 })
    }

    throw error
  }
}
