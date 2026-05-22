import { prisma } from '@/lib/db/prisma'
import { signAccessToken, signRefreshToken } from './jwt'
import { v4 as uuidv4 } from 'uuid'

export async function createSession(
  user: { id: string; role: string },
  meta: { ipAddress?: string; userAgent?: string; deviceName?: string },
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const sessionId = uuidv4()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id, user.role, sessionId),
    signRefreshToken(user.id, sessionId),
  ])

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshToken,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      deviceName: meta.deviceName,
    },
  })

  return { accessToken, refreshToken, sessionId }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function getValidSession(sessionId: string) {
  return prisma.session.findFirst({
    where: {
      id: sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  })
}

export async function rotateSessionTokens(sessionId: string) {
  const session = await getValidSession(sessionId)
  if (!session) {
    return null
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(session.user.id, session.user.role, session.id),
    signRefreshToken(session.user.id, session.id),
  ])

  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  return {
    accessToken,
    refreshToken,
    session,
  }
}
