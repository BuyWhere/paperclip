# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api-health.spec.ts >> GET /api/health returns 200 with ok status
- Location: e2e/api-health.spec.ts:3:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 404
```

# Test source

```ts
  1 | import { test, expect } from '@playwright/test';
  2 | 
  3 | test('GET /api/health returns 200 with ok status', async ({ request }) => {
  4 |   const response = await request.get('/api/health');
> 5 |   expect(response.status()).toBe(200);
    |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  6 |   const body = await response.json();
  7 |   expect(body.status).toBe('ok');
  8 | });
  9 | 
```