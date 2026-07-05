import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { z } from 'zod'

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Invalid email address').max(254),
  subject: z.string().trim().min(1, 'Subject is required').max(160),
  message: z.string().trim().min(1, 'Message is required').max(5000),
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = contactSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid contact request' },
      { status: 422 },
    )
  }

  const { name, email, subject, message } = parsed.data

  try {
    const host = getRequiredEnv('SMTP_HOST')
    const user = getRequiredEnv('SMTP_USER')
    const pass = getRequiredEnv('SMTP_PASSWORD')
    const port = Number(process.env.SMTP_PORT ?? 587)
    const from = process.env.SMTP_FROM ?? 'noreply@8os.ai'
    const to = process.env.CONTACT_TO_EMAIL ?? 'hello@8os.ai'

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    const safeName = escapeHtml(name)
    const safeEmail = escapeHtml(email)
    const safeSubject = escapeHtml(subject)
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br />')

    await transporter.sendMail({
      from,
      to,
      replyTo: `${name} <${email}>`,
      subject: `[8os contact] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
      html: `
        <h2>New 8os contact form submission</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact form send error:', error)
    return NextResponse.json(
      { error: 'Contact form is temporarily unavailable. Please email hello@8os.ai.' },
      { status: 503 },
    )
  }
}
