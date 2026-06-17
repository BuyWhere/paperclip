// OS-1239: tests for the Vercel proxy DELETE branch added in
// wt-os1211-reconcile on branch alex/os-1239-waitlist-delete-proxy.
// The branch forwards to the orchestrator's /waitlist/entry/{entry_id}
// endpoint (restored in OS-1237) and re-emits its status codes so admin
// tooling can distinguish success, missing, and config-mismatch.

const mockFetch = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  prisma: {},
}));

import { DELETE } from '../route';

const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  mockFetch.mockReset();
  process.env = { ...originalEnv, ADMIN_API_KEY: 'test-admin-key' };
  (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

afterAll(() => {
  process.env = originalEnv;
});

function makeRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

describe('OS-1239 /api/waitlist DELETE proxy', () => {
  test('returns 503 when ADMIN_API_KEY is unset', async () => {
    process.env = { ...originalEnv }; // explicitly no ADMIN_API_KEY
    const req = makeRequest('https://8os.ai/api/waitlist?id=abc-123');
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/ADMIN_API_KEY unset/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns 400 when id is missing from both query and body', async () => {
    const req = makeRequest('https://8os.ai/api/waitlist', { method: 'DELETE' });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing id/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('forwards DELETE to orchestrator with x-api-key header (query-string id)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: true, id: 'abc-123' }), { status: 200 })
    );
    const req = makeRequest('https://8os.ai/api/waitlist?id=abc-123', { method: 'DELETE' });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.8os.ai/waitlist/entry/abc-123');
    expect(init.method).toBe('DELETE');
    expect(init.headers['x-api-key']).toBe('test-admin-key');
    const body = await res.json();
    expect(body).toEqual({ success: true, deleted: true, id: 'abc-123' });
  });

  test('forwards DELETE to orchestrator with x-api-key header (body id)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: true, id: 'def-456' }), { status: 200 })
    );
    const req = makeRequest('https://8os.ai/api/waitlist', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'def-456' }),
    });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.8os.ai/waitlist/entry/def-456');
    expect(init.method).toBe('DELETE');
    expect(init.headers['x-api-key']).toBe('test-admin-key');
  });

  test('returns 404 verbatim when orchestrator says entry missing (idempotent)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Waitlist entry ghost-id not found' }), {
        status: 404,
      })
    );
    const req = makeRequest('https://8os.ai/api/waitlist?id=ghost-id', { method: 'DELETE' });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Entry not found', id: 'ghost-id' });
  });

  test('returns 401 verbatim when orchestrator rejects the admin key', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Invalid or missing admin API key' }), {
        status: 401,
      })
    );
    const req = makeRequest('https://8os.ai/api/waitlist?id=abc-123', { method: 'DELETE' });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Orchestrator rejected admin key/);
  });

  test('returns 502 with detail when orchestrator returns 5xx', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'database connection refused' }), { status: 503 })
    );
    const req = makeRequest('https://8os.ai/api/waitlist?id=abc-123', { method: 'DELETE' });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to delete waitlist entry/);
    expect(body.detail).toBe('database connection refused');
  });

  test('returns 502 with generic detail when orchestrator 5xx has no body', async () => {
    mockFetch.mockResolvedValueOnce(new Response('upstream is on fire', { status: 502 }));
    const req = makeRequest('https://8os.ai/api/waitlist?id=abc-123', { method: 'DELETE' });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toBe('orchestrator returned 502');
  });

  test('returns 502 when fetch itself throws (network failure)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const req = makeRequest('https://8os.ai/api/waitlist?id=abc-123', { method: 'DELETE' });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Upstream waitlist service unavailable/);
  });

  test('encodes id in the path (UUIDs with hyphens survive verbatim)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ deleted: true, id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }), {
        status: 200,
      })
    );
    const req = makeRequest('https://8os.ai/api/waitlist?id=a1b2c3d4-e5f6-7890-abcd-ef1234567890', {
      method: 'DELETE',
    });
    const res = await DELETE(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.8os.ai/waitlist/entry/a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });
});
