import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { signPasswordResetToken } from '@/lib/auth/jwt'
import { consumeResetRequest } from '@/lib/auth/rate-limit'
import { v4 as uuidv4 } from 'uuid'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest) {
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

  const { email } = parsed.data

  // Rate limit: 3 requests per email per hour
  try {
    await consumeResetRequest(email)
  } catch {
    return NextResponse.json({ error: 'Too many reset requests. Try again later.' }, { status: 429 })
  }

  // Always return 200 to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return NextResponse.json({ message: 'If that account exists, a reset link has been sent.' })
  }

  // Invalidate old unused tokens
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() }, // mark as used to invalidate
  })

  const jti = uuidv4()
  const token = await signPasswordResetToken(user.id, jti)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${token}`

  // Send reset email
  try {
    const nodemailer = await import('nodemailer')
    const transporter = (nodemailer.default ?? nodemailer).createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@8os.ai',
      to: email,
      subject: 'Reset your 8os password',
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 2rem; background: #0a0a0a; color: #ededed; border-radius: 12px;">
          <h2>Reset your password</h2>
          <p>Click the link below to reset your 8os password. This link expires in 1 hour and can only be used once.</p>
          <a href="${resetUrl}" style="display: inline-block; background: #fff; color: #000; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 1rem 0;">Reset password</a>
          <p style="color: #888; font-size: 0.875rem;">If you didn't request this, ignore this email.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[forgot-password] email send failed:', err)
    // Don't expose the error to the client
  }

  return NextResponse.json({ message: 'If that account exists, a reset link has been sent.' })
}
