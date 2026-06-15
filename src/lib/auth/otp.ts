import crypto from 'crypto'

export function generateOtp(digits = 6): string {
  const max = Math.pow(10, digits)
  const buf = crypto.randomBytes(4)
  const num = buf.readUInt32BE(0) % max
  return num.toString().padStart(digits, '0')
}

/** Send OTP via preferred channel. Integrations are injected via env vars. */
export async function sendOtp(
  destination: string,
  code: string,
  channel: 'sms' | 'whatsapp' | 'email',
): Promise<void> {
  const message = `Your 8os verification code is: ${code}. Expires in 10 minutes.`

  if (channel === 'email') {
    await sendEmailOtp(destination, code)
  } else {
    // SMS / WhatsApp via Twilio (or any provider injected via env)
    await sendTwilioOtp(destination, message, channel)
  }
}

async function sendEmailOtp(email: string, code: string): Promise<void> {
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
    subject: 'Your 8os verification code',
    text: `Your verification code is: ${code}\n\nExpires in 10 minutes.`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 2rem; background: #0a0a0a; color: #ededed; border-radius: 12px;">
        <h2 style="margin: 0 0 1rem;">Your 8os code</h2>
        <div style="font-size: 2rem; font-weight: bold; letter-spacing: 0.5rem; text-align: center; padding: 1.5rem; background: #111; border-radius: 8px; margin: 1rem 0;">
          ${code}
        </div>
        <p style="color: #666; font-size: 0.875rem;">Expires in 10 minutes. Do not share this code.</p>
      </div>
    `,
  })
}

async function sendTwilioOtp(to: string, body: string, channel: 'sms' | 'whatsapp'): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !from) {
    // In dev, log the OTP instead of sending
    console.log(`[OTP DEV] ${channel.toUpperCase()} to ${to}: ${body}`)
    return
  }

  const fromAddr = channel === 'whatsapp' ? `whatsapp:${from}` : from
  const toAddr = channel === 'whatsapp' ? `whatsapp:${to}` : to

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: fromAddr, To: toAddr, Body: body }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Twilio error: ${err}`)
  }
}
