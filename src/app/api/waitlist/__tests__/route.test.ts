import { NextRequest } from 'next/server'
import * as routeModule from '../route'

const ADMIN_SECRET = 'admin-secret-for-tests-32chars-min'

function makeDeleteRequest(query: string, auth?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (auth) headers.authorization = auth
  return new NextRequest(`http://localhost/api/waitlist${query}`, {
    method: 'DELETE',
    headers,
  })
}

describe('DELETE /api/waitlist (OS-1092)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.ADMIN_SECRET = ADMIN_SECRET
    delete process.env.ORCHESTRATOR_URL // use the public api.8os.ai default
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('returns 401 when no Authorization header is present', async () => {
    const res = await routeModule.DELETE(makeDeleteRequest('?id=42'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when Authorization does not match ADMIN_SECRET', async () => {
    const res = await routeModule.DELETE(
      makeDeleteRequest('?id=42', 'Bearer wrong-secret')
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when id query param is missing', async () => {
    const res = await routeModule.DELETE(
      makeDeleteRequest('', `Bearer ${ADMIN_SECRET}`)
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Missing required query param/)
  })

  it('returns 400 when id is not a positive integer', async () => {
    const res = await routeModule.DELETE(
      makeDeleteRequest('?id=abc', `Bearer ${ADMIN_SECRET}`)
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid entry id/)
  })

  it('returns 400 when id is zero or negative', async () => {
    const res = await routeModule.DELETE(
      makeDeleteRequest('?id=0', `Bearer ${ADMIN_SECRET}`)
    )
    expect(res.status).toBe(400)
  })

  it('forwards DELETE to orchestrator with x-api-key on success', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await routeModule.DELETE(
      makeDeleteRequest('?id=42', `Bearer ${ADMIN_SECRET}`)
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, deleted: '42' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/waitlist/entry/42')
    expect(init.method).toBe('DELETE')
    expect(init.headers['x-api-key']).toBe(ADMIN_SECRET)
  })

  it('accepts entry_id as an alias for id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response('{}', { status: 200 })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await routeModule.DELETE(
      makeDeleteRequest('?entry_id=99', `Bearer ${ADMIN_SECRET}`)
    )

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toContain('/waitlist/entry/99')
  })

  it('returns 404 when orchestrator says the entry is missing', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await routeModule.DELETE(
      makeDeleteRequest('?id=999', `Bearer ${ADMIN_SECRET}`)
    )

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Entry not found' })
  })

  it('returns 502 when orchestrator returns a non-2xx/4xx code', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response('upstream blew up', { status: 500 })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await routeModule.DELETE(
      makeDeleteRequest('?id=1', `Bearer ${ADMIN_SECRET}`)
    )

    expect(res.status).toBe(502)
  })

  it('returns 502 when fetch throws (network error)', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    global.fetch = fetchMock as unknown as typeof fetch

    const res = await routeModule.DELETE(
      makeDeleteRequest('?id=1', `Bearer ${ADMIN_SECRET}`)
    )

    expect(res.status).toBe(502)
  })
})
