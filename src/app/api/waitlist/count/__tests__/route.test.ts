import { GET } from '../route'

describe('GET /api/waitlist/count (OS-4764)', () => {
  let fetchMock: jest.SpyInstance

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch')
  })

  afterEach(() => {
    fetchMock.mockRestore()
  })

  it('returns the canonical api.8os.ai count first', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ count: 516 }),
    })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ count: 516 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://api.8os.ai/api/waitlist/count', { cache: 'no-store' })
  })

  it('falls back to the direct orchestrator count when the canonical API fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ count: 517 }) })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ count: 517 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://orchestrator-production-1643.up.railway.app/waitlist/count', { cache: 'no-store' })
  })

  it('returns 502 instead of a misleading zero when every upstream fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body).toEqual({ error: 'Upstream waitlist count unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
