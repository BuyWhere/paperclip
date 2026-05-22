import { test, expect } from '@playwright/test';

test('GET /og-image.png returns 200', async ({ request }) => {
  const response = await request.get('/og-image.png');
  expect(response.status()).toBe(200);
  const contentType = response.headers()['content-type'];
  expect(contentType).toMatch(/image/);
});
