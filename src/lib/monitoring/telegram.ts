/**
 * Telegram bot alerting for 5xx errors and slow responses.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN — bot token from BotFather
 *   TELEGRAM_CHAT_ID   — target chat or channel id
 */

const TELEGRAM_API = 'https://api.telegram.org'

export async function notifyTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) return // silently skip if not configured

  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
  } catch {
    // Non-fatal: monitoring should never break the app
  }
}

/**
 * Alert on 5xx responses. Call from API error handlers.
 */
export function alert5xx(path: string, status: number, err: unknown): void {
  const msg = `🚨 *5xx Error* on \`${path}\`\nStatus: ${status}\n\`${String(err)}\``
  notifyTelegram(msg).catch(() => {})
}

/**
 * Alert when API response time exceeds threshold (default 500ms).
 */
export function alertSlowResponse(path: string, durationMs: number, threshold = 500): void {
  if (durationMs < threshold) return
  const msg = `⏱ *Slow Response* on \`${path}\`\nDuration: ${durationMs}ms (threshold: ${threshold}ms)`
  notifyTelegram(msg).catch(() => {})
}
