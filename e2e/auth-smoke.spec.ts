/**
 * Auth smoke tests — go/no-go B1–B4
 *
 * B1: POST /api/auth/register returns 201 for a fresh email
 * B2: POST /api/auth/login returns 200 + sets auth cookies
 * B3: Authenticated endpoint (/api/insights) is reachable with the session cookie
 * B4: POST /api/auth/logout clears the session
 *
 * CI bypass: the X-CI-Secret header is set from CI_BYPASS_SECRET env var so that
 * the per-IP registration rate limit is skipped during automated test runs.
 */

import { test, expect } from '@playwright/test';

const CI_SECRET = process.env.CI_BYPASS_SECRET ?? '';

// Unique email per test run so re-runs don't hit the "already exists" 409
function uniqueEmail() {
  return `smoke+${Date.now()}@8os-test.invalid`;
}

test.describe('Auth smoke — B1/B2/B3/B4', () => {
  test('B1: POST /api/auth/register → 201', async ({ request }) => {
    const email = uniqueEmail();
    const res = await request.post('/api/auth/register', {
      headers: CI_SECRET ? { 'x-ci-secret': CI_SECRET } : {},
      data: { email, password: 'Smoke!Test99', channel: 'email' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(email);
  });

  test('B2: POST /api/auth/login → 200 + auth cookie', async ({ request }) => {
    // Register first (with CI bypass) so we have a known credential
    const email = uniqueEmail();
    const regRes = await request.post('/api/auth/register', {
      headers: CI_SECRET ? { 'x-ci-secret': CI_SECRET } : {},
      data: { email, password: 'Smoke!Test99', channel: 'email' },
    });
    expect(regRes.status()).toBe(201);

    // Login
    const loginRes = await request.post('/api/auth/login', {
      data: { identifier: email, password: 'Smoke!Test99' },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user).toBeDefined();

    // Auth cookie must be set
    const headers = loginRes.headers();
    const setCookie = headers['set-cookie'] ?? '';
    expect(setCookie).toMatch(/access_token|session/i);
  });

  test('B3: Authenticated /api/insights reachable with session', async ({ request }) => {
    // Register + login to obtain a session
    const email = uniqueEmail();
    await request.post('/api/auth/register', {
      headers: CI_SECRET ? { 'x-ci-secret': CI_SECRET } : {},
      data: { email, password: 'Smoke!Test99', channel: 'email' },
    });

    const loginRes = await request.post('/api/auth/login', {
      data: { identifier: email, password: 'Smoke!Test99' },
    });
    expect(loginRes.status()).toBe(200);

    // Playwright's APIRequestContext automatically forwards cookies from the same origin
    const insightsRes = await request.get('/api/insights');
    // Accept 200 (data) or 204 (empty) — both mean the endpoint is reachable and authenticated
    expect([200, 204]).toContain(insightsRes.status());
  });

  test('B4: POST /api/auth/logout clears session', async ({ request }) => {
    const email = uniqueEmail();
    await request.post('/api/auth/register', {
      headers: CI_SECRET ? { 'x-ci-secret': CI_SECRET } : {},
      data: { email, password: 'Smoke!Test99', channel: 'email' },
    });
    await request.post('/api/auth/login', {
      data: { identifier: email, password: 'Smoke!Test99' },
    });

    const logoutRes = await request.post('/api/auth/logout');
    expect([200, 204]).toContain(logoutRes.status());

    // After logout, /api/insights should reject the request
    const afterLogout = await request.get('/api/insights');
    expect([401, 403]).toContain(afterLogout.status());
  });
});
