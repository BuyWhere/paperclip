import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAuth } from '@/lib/auth/require-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { email: true },
  })

  if (!user?.email) {
    return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 })
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { email: user.email },
  })

  if (!affiliate) {
    return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 })
  }

  const [clicks, attributions, conversions] = await Promise.all([
    prisma.referralClick.count({ where: { affiliateId: affiliate.id } }),
    prisma.referralAttribution.count({ where: { affiliateId: affiliate.id } }),
    prisma.affiliateConversion.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { conversionAt: 'desc' },
      select: {
        id: true,
        planName: true,
        revenueAmount: true,
        revenueCurrency: true,
        commissionAmount: true,
        commissionBps: true,
        payoutStatus: true,
        conversionAt: true,
      },
    }),
  ])

  return NextResponse.json({
    affiliate: {
      id: affiliate.id,
      code: affiliate.code,
      name: affiliate.name,
      status: affiliate.status,
      defaultCommissionBps: affiliate.defaultCommissionBps,
    },
    stats: {
      clicks,
      attributedUsers: attributions,
      conversions: conversions.length,
      pendingCommissionAmount: conversions
        .filter((conversion) => conversion.payoutStatus === 'pending')
        .reduce((total, conversion) => total + Number(conversion.commissionAmount), 0)
        .toFixed(2),
    },
    conversions: conversions.map((conversion) => ({
      ...conversion,
      revenueAmount: conversion.revenueAmount.toString(),
      commissionAmount: conversion.commissionAmount.toString(),
    })),
  })
}
