jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    passwordReset: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    session: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/auth/jwt', () => ({
  verifyPasswordResetToken: jest.fn(),
}))

jest.mock('@/lib/auth/password', () => ({
  hashPassword: jest.fn(),
  isPasswordPwned: jest.fn(),
}))

import { POST } from '../reset-password/route'
import { prisma } from '@/lib/db/prisma'
import { verifyPasswordResetToken } from '@/lib/auth/jwt'
import { hashPassword, isPasswordPwned } from '@/lib/auth/password'

const prismaMock = prisma as unknown as {
  passwordReset: { findUnique: jest.Mock; update: jest.Mock }
  user: { update: jest.Mock }
  session: { updateMany: jest.Mock }
  $transaction: jest.Mock
}

const verifyPasswordResetTokenMock = verifyPasswordResetToken as jest.Mock
const hashPasswordMock = hashPassword as jest.Mock
const isPasswordPwnedMock = isPasswordPwned as jest.Mock

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops))
  })

  it('resets the password and revokes all active sessions for the user', async () => {
    verifyPasswordResetTokenMock.mockResolvedValue({ sub: 'user-123', jti: 'reset-jti' })
    prismaMock.passwordReset.findUnique.mockResolvedValue({
      userId: 'user-123',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    })
    isPasswordPwnedMock.mockResolvedValue(false)
    hashPasswordMock.mockResolvedValue('hashed-password')
    prismaMock.passwordReset.update.mockResolvedValue({})
    prismaMock.user.update.mockResolvedValue({})
    prismaMock.session.updateMany.mockResolvedValue({ count: 2 })

    const response = await POST(
      new Request('http://localhost/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'reset-token',
          newPassword: 'N3wP@ssw0rd!',
        }),
      }) as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      message: 'Password reset successful. You can now log in.',
      pwnedWarning: undefined,
    })

    expect(prismaMock.passwordReset.update).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
      data: { usedAt: expect.any(Date) },
    })
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: { passwordHash: 'hashed-password', failedLoginCount: 0, lockedUntil: null },
    })
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-123', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })
})
