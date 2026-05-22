import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminSecret } from '@/lib/auth/admin-secret'
import { recordAffiliateConversionFromPaidUpgrade } from '@/lib/affiliate/service'

const schema = z.object({
  userId: z.string().min(1),
  planName: z.string().trim().min(1).max(120),
  revenueAmount: z.union([z.number().positive(), z.string().min(1)]),
  revenueCurrency: z.string().trim().length(3).default('USD'),
  subscriptionProvider: z.string().trim().min(1).max(64).optional(),
  subscriptionExternalId: z.string().trim().min(1).max(191).optional(),
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

  try {
    const result = await recordAffiliateConversionFromPaidUpgrade(parsed.data)

    if (!result.created) {
      return NextResponse.json(result, {
        status: result.reason === 'conversion_exists' ? 200 : 409,
      })
    }

    return NextResponse.json({
      created: true,
      conversion: {
        ...result.conversion,
        revenueAmount: result.conversion.revenueAmount.toString(),
        commissionAmount: result.conversion.commissionAmount.toString(),
      },
      user: {
        id: result.user.id,
        role: result.user.role,
      },
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && /Amount must be a positive number/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }

    throw error
  }
}
