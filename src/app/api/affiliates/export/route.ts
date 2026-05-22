import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminSecret } from '@/lib/auth/admin-secret'
import { buildAffiliateConversionCsv } from '@/lib/affiliate/service'

function buildExportBatchId(): string {
  return `affexp_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdminSecret(req)
  if (unauthorized) return unauthorized

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.affiliateConversion.findMany({
      where: { payoutStatus: 'pending' },
      orderBy: { conversionAt: 'asc' },
      include: {
        affiliate: {
          select: {
            name: true,
            email: true,
            code: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    })

    const batchId = buildExportBatchId()

    if (!dryRun && pending.length > 0) {
      await tx.affiliateConversion.updateMany({
        where: { id: { in: pending.map((row) => row.id) } },
        data: {
          payoutStatus: 'exported',
          exportBatchId: batchId,
        },
      })
    }

    return { pending, batchId }
  })

  const csv = buildAffiliateConversionCsv(result.pending.map((row) => ({
    affiliateName: row.affiliate.name,
    affiliateEmail: row.affiliate.email,
    affiliateCode: row.affiliate.code,
    userId: row.user.id,
    userEmail: row.user.email,
    planName: row.planName,
    subscriptionExternalId: row.subscriptionExternalId,
    conversionAt: row.conversionAt,
    revenueAmount: row.revenueAmount.toString(),
    revenueCurrency: row.revenueCurrency,
    commissionBps: row.commissionBps,
    commissionAmount: row.commissionAmount.toString(),
    payoutStatus: dryRun ? row.payoutStatus : 'exported',
  })))

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="affiliate-conversions-${result.batchId}.csv"`,
      'x-affiliate-export-batch-id': result.batchId,
      'x-affiliate-export-count': String(result.pending.length),
      'x-affiliate-export-dry-run': dryRun ? '1' : '0',
    },
  })
}
