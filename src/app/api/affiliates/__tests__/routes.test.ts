jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    affiliate: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    referralAttribution: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    affiliateConversion: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    referralClick: {
      count: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '@/lib/db/prisma'
import { POST as createConversionRoute } from '../conversions/route'
import { GET as exportRoute } from '../export/route'
import { NextRequest } from 'next/server'

const prismaMock = prisma as any

function makeAdminReq(url: string, method: string, body?: object): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer secret',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('affiliate routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ADMIN_SECRET = 'secret'
    prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock))
  })

  it('records a 30% conversion when a referred user upgrades to pro', async () => {
    prismaMock.referralAttribution.findUnique.mockResolvedValue({
      affiliateId: 'aff_1',
      affiliate: {
        status: 'active',
        defaultCommissionBps: 3000,
      },
    } as any)
    prismaMock.affiliateConversion.findUnique.mockResolvedValue(null)
    prismaMock.user.update.mockResolvedValue({ id: 'user_1', role: 'pro' } as any)
    prismaMock.affiliateConversion.create.mockResolvedValue({
      id: 'conv_1',
      revenueAmount: { toString: () => '100.00' },
      commissionAmount: { toString: () => '30.00' },
      commissionBps: 3000,
    } as any)

    const req = makeAdminReq('http://localhost/api/affiliates/conversions', 'POST', {
      userId: 'user_1',
      planName: 'Pro Annual',
      revenueAmount: 100,
      revenueCurrency: 'usd',
    })
    const res = await createConversionRoute(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { role: 'pro' },
    })
    expect(prismaMock.affiliateConversion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affiliateId: 'aff_1',
        userId: 'user_1',
        planName: 'Pro Annual',
        revenueAmount: '100.00',
        commissionAmount: '30.00',
        revenueCurrency: 'USD',
        commissionBps: 3000,
      }),
    })
    expect(body.conversion.commissionAmount).toBe('30.00')
  })

  it('exports pending conversions as CSV and marks them exported', async () => {
    const rows = [
      {
        id: 'conv_1',
        planName: 'Pro Annual',
        subscriptionExternalId: 'sub_123',
        conversionAt: new Date('2026-05-07T12:00:00.000Z'),
        revenueAmount: { toString: () => '100.00' },
        revenueCurrency: 'USD',
        commissionBps: 3000,
        commissionAmount: { toString: () => '30.00' },
        payoutStatus: 'pending',
        affiliate: { name: 'Alice Affiliate', email: 'alice@example.com', code: 'alice' },
        user: { id: 'user_1', email: 'buyer@example.com' },
      },
    ]
    prismaMock.affiliateConversion.findMany.mockResolvedValue(rows as any)
    prismaMock.affiliateConversion.updateMany.mockResolvedValue({ count: 1 } as any)

    const req = makeAdminReq('http://localhost/api/affiliates/export', 'GET')
    const res = await exportRoute(req)
    const csv = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(csv).toContain('affiliate_name,affiliate_email,affiliate_code')
    expect(csv).toContain('"Alice Affiliate","alice@example.com","alice"')
    expect(csv).toContain('"30.00"')
    expect(prismaMock.affiliateConversion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['conv_1'] } },
      data: expect.objectContaining({
        payoutStatus: 'exported',
      }),
    })
  })
})
