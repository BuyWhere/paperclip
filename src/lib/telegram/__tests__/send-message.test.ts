import { sendTelegramMessage } from '../send-message'

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token'
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.TELEGRAM_BOT_TOKEN
  } else {
    process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TOKEN
  }
})

function mockFetch(status: number, body: string = '{}'): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response)
  global.fetch = fn as unknown as typeof fetch
  return fn
}

describe('sendTelegramMessage', () => {
  it('returns true on a 200 OK from Telegram', async () => {
    const fetchMock = mockFetch(200)

    const result = await sendTelegramMessage({
      chat_id: 123,
      text: 'hello',
    })

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/bottest-bot-token/sendMessage')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      chat_id: 123,
      text: 'hello',
    })
  })

  it('throws on a 4xx response from Telegram', async () => {
    mockFetch(400, 'bad request')

    await expect(
      sendTelegramMessage({ chat_id: 123, text: 'hello' }),
    ).rejects.toThrow(/Telegram sendMessage failed: 400/)
  })

  it('throws on a 5xx response from Telegram', async () => {
    mockFetch(502, 'bad gateway')

    await expect(
      sendTelegramMessage({ chat_id: 123, text: 'hello' }),
    ).rejects.toThrow(/Telegram sendMessage failed: 502/)
  })

  it('throws when the request times out', async () => {
    // fetch that never resolves (signal abort causes it to throw AbortError)
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
    global.fetch = jest.fn().mockRejectedValue(abortError) as unknown as typeof fetch

    await expect(
      sendTelegramMessage({ chat_id: 123, text: 'hello' }, 10),
    ).rejects.toThrow(/timed out after 10ms/)
  })

  it('throws when TELEGRAM_BOT_TOKEN is not set', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN

    await expect(
      sendTelegramMessage({ chat_id: 123, text: 'hello' }),
    ).rejects.toThrow(/TELEGRAM_BOT_TOKEN is not set/)
  })
})
