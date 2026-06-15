import { NextRequest } from 'next/server'
import { sendTelegramMessage } from '@/lib/telegram/send-message'
import * as routeModule from '../route'

jest.mock('@/lib/telegram/send-message', () => ({
  sendTelegramMessage: jest.fn().mockResolvedValue(true),
}))

const sendTelegramMessageMock = sendTelegramMessage as jest.Mock
const WEBHOOK_SECRET = 'super-secret-token-1234567890abcdef'

function makeRequest(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { ...init.headers, 'content-type': 'application/json' }
  }
  return new NextRequest('http://localhost/api/telegram/webhook', init)
}

const validUpdate = (text: string, firstName?: string) => ({
  update_id: 1001,
  message: {
    message_id: 1,
    chat: { id: 42, type: 'private' },
    from: firstName
      ? { id: 555, first_name: firstName, is_bot: false }
      : { id: 555, is_bot: false },
    text,
    date: 1_700_000_000,
  },
})

// Drain the fire-and-forget microtask chain so assertions on sendMessage
// see the call from handleUpdate.
async function flushAsync() {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token'
  delete process.env.ORCHESTRATOR_URL
})

describe('POST /api/telegram/webhook', () => {
  it('returns 401 when the secret header is missing', async () => {
    const req = makeRequest('POST', validUpdate('/start'))
    const res = await routeModule.POST(req)
    expect(res.status).toBe(401)
    expect(sendTelegramMessageMock).not.toHaveBeenCalled()
  })

  it('returns 401 when the secret header does not match', async () => {
    const req = makeRequest('POST', validUpdate('/start'), {
      'x-telegram-bot-api-secret-token': 'wrong-secret',
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(401)
    expect(sendTelegramMessageMock).not.toHaveBeenCalled()
  })

  it('returns 500 when TELEGRAM_WEBHOOK_SECRET env is unset', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    const req = makeRequest('POST', validUpdate('/start'), {
      'x-telegram-bot-api-secret-token': 'whatever',
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(500)
    expect(sendTelegramMessageMock).not.toHaveBeenCalled()
  })

  it('returns 200 and calls sendMessage with the onboarding prompt on /start', async () => {
    const req = makeRequest('POST', validUpdate('/start', 'Ada'), {
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    await flushAsync()

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
    const call = sendTelegramMessageMock.mock.calls[0][0]
    expect(call.chat_id).toBe(42)
    expect(call.text).toContain('Welcome Ada')
    expect(call.text).toContain('full name')
    expect(call.parse_mode).toBe('Markdown')
  })

  it('returns the generic onboarding prompt when /start has no first_name', async () => {
    const update = {
      update_id: 1001,
      message: {
        message_id: 1,
        chat: { id: 42, type: 'private' },
        from: { id: 555, is_bot: false },
        text: '/start',
        date: 1_700_000_000,
      },
    }
    const req = makeRequest('POST', update, {
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageMock.mock.calls[0][0].text).toMatch(
      /^👋 Welcome to 8os/,
    )
  })

  it('replies with the help text on /help', async () => {
    const req = makeRequest('POST', validUpdate('/help'), {
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
    const text = sendTelegramMessageMock.mock.calls[0][0].text
    expect(text).toContain('/start')
    expect(text).toContain('/status')
    expect(text).toContain('/archetype')
  })

  it('replies with the "only respond to" message for unknown text', async () => {
    const req = makeRequest('POST', validUpdate('hello there'), {
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(200)

    await flushAsync()

    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(1)
    const text = sendTelegramMessageMock.mock.calls[0][0].text
    expect(text).toContain('I only respond to /start, /help, /status, /archetype')
  })

  it('ignores updates without a message.text and does not call sendMessage', async () => {
    const update = {
      update_id: 1001,
      message: {
        message_id: 1,
        chat: { id: 42, type: 'private' },
        from: { id: 555, first_name: 'Ada', is_bot: false },
        // no `text` field
        date: 1_700_000_000,
      },
    }
    const req = makeRequest('POST', update, {
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(200)
    await flushAsync()
    expect(sendTelegramMessageMock).not.toHaveBeenCalled()
  })

  it('still returns 200 on a malformed JSON body', async () => {
    const req = new NextRequest('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
      },
      body: '{not json',
    })
    const res = await routeModule.POST(req)
    expect(res.status).toBe(200)
  })
})

describe('GET /api/telegram/webhook', () => {
  it('does not export a GET handler (Next returns 405)', () => {
    // The App Router returns 405 for any method that isn't an exported
    // handler. Asserting the handler is undefined keeps that contract.
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined()
  })
})
