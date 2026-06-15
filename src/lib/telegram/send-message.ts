/**
 * Telegram bot sendMessage helper.
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN — bot token from BotFather
 *
 * Returns true on a 200 OK from Telegram. Throws on any non-2xx response,
 * network error, or timeout.
 */

const TELEGRAM_API = 'https://api.telegram.org'
const DEFAULT_TIMEOUT_MS = 5000

export interface SendMessageOptions {
  chat_id: number | string
  text: string
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML'
}

export async function sendTelegramMessage(
  options: SendMessageOptions,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<true> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set')
  }

  const body: Record<string, unknown> = {
    chat_id: options.chat_id,
    text: options.text,
  }
  if (options.parse_mode) {
    body.parse_mode = options.parse_mode
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error(`Telegram sendMessage timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Telegram sendMessage failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
    )
  }

  return true
}
