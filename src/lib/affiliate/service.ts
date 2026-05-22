import { prisma } from '@/lib/db/prisma'

const DEFAULT_COMMISSION_BPS = 3000

export function amountToCents(amount: number | string): number {
  const numeric = typeof amount === 'string' ? Number(amount) : amount

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('Amount must be a positive number')
  }

  return Math.round(numeric * 100)
}

export function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function calculateCommissionAmount(
  revenueAmount: number | string,
  commissionBps = DEFAULT_COMMISSION_BPS,
): { revenueAmount: string; commissionAmount: string; commissionBps: number } {
  const revenueCents = amountToCents(revenueAmount)
  const commissionCents = Math.round((revenueCents * commissionBps) / 10000)

  return {
    revenueAmount: centsToDecimalString(revenueCents),
    commissionAmount: centsToDecimalString(commissionCents),
    commissionBps,
  }
}

export async function createAffiliateCode(base: string): Promise<string> {
  const stem = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'affiliate'

  let candidate = stem
  let suffix = 1

  while (await prisma.affiliate.findUnique({ where: { code: candidate } })) {
    suffix += 1
    candidate = `${stem}-${suffix}`
  }

  return candidate
}

export async function recordAffiliateConversionFromPaidUpgrade(input: {
  userId: string
  planName: string
  revenueAmount: number | string
  revenueCurrency?: string
  subscriptionProvider?: string | null
  subscriptionExternalId?: string | null
}) {
  return prisma.$transaction(async (tx) => {
    const attribution = await tx.referralAttribution.findUnique({
      where: { userId: input.userId },
      include: { affiliate: true },
    })

    if (!attribution || attribution.affiliate.status !== 'active') {
      return { created: false as const, reason: 'no_active_attribution' as const }
    }

    const existing = await tx.affiliateConversion.findUnique({
      where: { userId: input.userId },
    })

    if (existing) {
      return { created: false as const, reason: 'conversion_exists' as const, conversion: existing }
    }

    const pricing = calculateCommissionAmount(
      input.revenueAmount,
      attribution.affiliate.defaultCommissionBps ?? DEFAULT_COMMISSION_BPS,
    )

    const user = await tx.user.update({
      where: { id: input.userId },
      data: { role: 'pro' },
    })

    const conversion = await tx.affiliateConversion.create({
      data: {
        affiliateId: attribution.affiliateId,
        userId: input.userId,
        subscriptionProvider: input.subscriptionProvider ?? null,
        subscriptionExternalId: input.subscriptionExternalId ?? null,
        planName: input.planName,
        revenueAmount: pricing.revenueAmount,
        revenueCurrency: (input.revenueCurrency ?? 'USD').toUpperCase(),
        commissionAmount: pricing.commissionAmount,
        commissionBps: pricing.commissionBps,
      },
    })

    return { created: true as const, user, conversion }
  })
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const normalized = value == null ? '' : String(value)
  return `"${normalized.replace(/"/g, '""')}"`
}

export function buildAffiliateConversionCsv(rows: Array<{
  affiliateName: string
  affiliateEmail: string
  affiliateCode: string
  userId: string
  userEmail: string | null
  planName: string
  subscriptionExternalId: string | null
  conversionAt: Date
  revenueAmount: string | number
  revenueCurrency: string
  commissionBps: number
  commissionAmount: string | number
  payoutStatus: string
}>): string {
  const header = [
    'affiliate_name',
    'affiliate_email',
    'affiliate_code',
    'user_id',
    'user_email',
    'plan_name',
    'subscription_external_id',
    'conversion_at',
    'revenue_amount',
    'revenue_currency',
    'commission_bps',
    'commission_amount',
    'payout_status',
  ]

  const lines = rows.map((row) => [
    row.affiliateName,
    row.affiliateEmail,
    row.affiliateCode,
    row.userId,
    row.userEmail,
    row.planName,
    row.subscriptionExternalId,
    row.conversionAt.toISOString(),
    row.revenueAmount,
    row.revenueCurrency,
    row.commissionBps,
    row.commissionAmount,
    row.payoutStatus,
  ].map(escapeCsvCell).join(','))

  return `${header.join(',')}\n${lines.join('\n')}`
}
