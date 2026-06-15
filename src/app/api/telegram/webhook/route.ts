import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { sendTelegramMessage } from '@/lib/telegram/send-message';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ||
  'https://orchestrator-production-1643.up.railway.app';

const ORCHESTRATOR_TIMEOUT_MS = 5000;

const ONBOARDING_PROMPT =
  "👋 Welcome to 8os — your personal operating system.\n\n" +
  "I'll ask 5 quick questions to generate your BaZi archetype and morning briefing. Takes ~60 seconds.\n\n" +
  "Ready? Reply with your **full name** to begin.";

const HELP_TEXT =
  "Available commands:\n" +
  "/start — Begin the 60-second onboarding\n" +
  "/help — Show this help\n" +
  "/status — Look up your current archetype\n" +
  "/archetype — Just your archetype name + dominant element";

const UNKNOWN_TEXT =
  "🤖 I only respond to /start, /help, /status, /archetype. Tap /start to begin.";

const ONBOARD_URL = 'https://8os.ai/onboarding';

interface TelegramUser {
  id: number;
  first_name?: string;
  is_bot?: boolean;
}

interface TelegramChat {
  id: number;
  type?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date?: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface ArchetypeInfo {
  archetype?: string;
  dominant_element?: string;
  description?: string;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function verifySecret(req: NextRequest): { ok: true } | { ok: false; status: number } {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    return { ok: false, status: 500 };
  }
  // HTTP header names are case-insensitive; the canonical Telegram casing is
  // X-Telegram-Bot-Api-Secret-Token.
  const provided = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}

async function lookupArchetype(
  telegramId: number,
): Promise<ArchetypeInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${ORCHESTRATOR_URL}/user/by-telegram/${encodeURIComponent(String(telegramId))}`,
      { method: 'GET', signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as ArchetypeInfo | null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function renderStart(firstName?: string): string {
  if (firstName) {
    return `👋 Welcome ${firstName} to 8os — your personal operating system.\n\n` +
      "I'll ask 5 quick questions to generate your BaZi archetype and morning briefing. Takes ~60 seconds.\n\n" +
      "Ready? Reply with your **full name** to begin.";
  }
  return ONBOARDING_PROMPT;
}

function renderStatus(info: ArchetypeInfo | null): string {
  if (!info || !info.archetype) {
    return `No archetype found yet. Onboard at ${ONBOARD_URL} to get yours.`;
  }
  return `Your current archetype is *${info.archetype}*.\n\n` +
    `Onboard at ${ONBOARD_URL} to refresh or view details.`;
}

function renderArchetype(info: ArchetypeInfo | null): string {
  if (!info || !info.archetype) {
    return 'No archetype found';
  }
  const element = info.dominant_element ? ` — ${info.dominant_element}` : '';
  const desc = info.description ? `\n\n${info.description}` : '';
  return `*${info.archetype}*${element}${desc}`;
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name;
  const text = msg.text.trim();
  const command = text.split(/\s+/)[0]?.toLowerCase() ?? '';

  let reply: string | null = null;

  switch (command) {
    case '/start':
      reply = renderStart(firstName);
      break;
    case '/help':
      reply = HELP_TEXT;
      break;
    case '/status': {
      const info = await lookupArchetype(msg.from?.id ?? 0);
      reply = renderStatus(info);
      break;
    }
    case '/archetype': {
      const info = await lookupArchetype(msg.from?.id ?? 0);
      reply = renderArchetype(info);
      break;
    }
    default:
      reply = UNKNOWN_TEXT;
      break;
  }

  if (reply !== null) {
    await sendTelegramMessage({
      chat_id: chatId,
      text: reply,
      parse_mode: 'Markdown',
    }).catch((err) => {
      console.error('[telegram webhook] sendMessage failed', err);
    });
  }
}

export async function POST(req: NextRequest) {
  const secret = verifySecret(req);
  if (!secret.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: secret.status });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    // Malformed body — still ack so Telegram stops retrying.
    return NextResponse.json({ ok: true });
  }

  const msg = update.message;
  const command = msg?.text ? msg.text.trim().split(/\s+/)[0]?.toLowerCase() ?? 'text' : 'text';
  console.log(
    `[telegram webhook] update_id=${update.update_id} chat_id=${msg?.chat.id ?? 'n/a'} command=${command}`,
  );

  // Fire-and-forget: Telegram requires a 200 within 2s, so we ack first and
  // process the command asynchronously. The Node runtime on Railway keeps the
  // event loop alive long enough to finish the sendMessage + orchestrator
  // lookup below.
  void handleUpdate(update).catch((err) => {
    console.error('[telegram webhook] handleUpdate failed', err);
  });

  return NextResponse.json({ ok: true });
}
