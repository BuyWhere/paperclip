import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { setAuthCookies } from '@/lib/auth/cookies'
import { createSession } from '@/lib/auth/session'
import { authenticateAccessToken } from '@/lib/auth/authenticate'
import { verifyTelegramAuthData } from '@/lib/auth/telegram'

/**
 * POST /api/auth/telegram/callback
 *
 * Handles Telegram Login Widget auth data from the browser.
 * The widget calls our JS callback which POSTs all Telegram fields here.
 *
 * Modes:
 *   login (default): create or resume session for Telegram identity
 *   link:  attach Telegram identity to the currently authenticated user
 *
 * Body fields: all fields from Telegram widget (id, first_name, last_name?,
 *   username?, photo_url?, auth_date, hash) plus optional _mode='link'.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, string>

    const mode = body._mode === 'link' ? 'link' : 'login'
    // Strip our internal field before passing to verifier
    const { _mode: _ignored, ...telegramFields } = body

    const profile = verifyTelegramAuthData(telegramFields)

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0] ??
      req.headers.get('x-real-ip') ??
      undefined
    const userAgent = req.headers.get('user-agent') ?? undefined
    const providerUid = String(profile.id)

    if (mode === 'link') {
      // Linking requires an active session
      const auth = await authenticateAccessToken(req)
      if (!auth) {
        return NextResponse.json(
          { error: 'Authentication required to link a Telegram account' },
          { status: 401 },
        )
      }

      // Check Telegram ID not already linked to a different account
      const existingOauth = await prisma.oauthAccount.findUnique({
        where: { provider_providerUid: { provider: 'telegram', providerUid } },
      })

      if (existingOauth && existingOauth.userId !== auth.userId) {
        return NextResponse.json(
          { error: 'This Telegram account is already linked to another user' },
          { status: 409 },
        )
      }

      await prisma.oauthAccount.upsert({
        where: { provider_providerUid: { provider: 'telegram', providerUid } },
        update: { userId: auth.userId },
        create: {
          userId: auth.userId,
          provider: 'telegram',
          providerUid,
        },
      })

      return NextResponse.json({ ok: true })
    }

    // ── Login / signup flow ────────────────────────────────────────────────────
    let userId: string

    const existingOauth = await prisma.oauthAccount.findUnique({
      where: { provider_providerUid: { provider: 'telegram', providerUid } },
    })

    if (existingOauth) {
      // Known Telegram identity — reuse existing user
      userId = existingOauth.userId
    } else {
      // New Telegram identity — create user
      // Telegram users may have no email/phone; that's fine per our schema (both nullable)
      const createdUser = await prisma.user.create({
        data: {
          oauthAccounts: {
            create: {
              provider: 'telegram',
              providerUid,
            },
          },
        },
      })
      userId = createdUser.id
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    const { accessToken, refreshToken } = await createSession(user, {
      ipAddress: ip,
      userAgent,
    })

    const redirectTo = user.onboardingDone ? '/dashboard' : '/onboarding'

    const response = NextResponse.json({ ok: true, redirectTo })
    setAuthCookies(response, accessToken, refreshToken)
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Telegram sign-in failed'
    console.error('[telegram] callback failed', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
