import { test, expect } from '@playwright/test';

const footerLinks = [
  { label: 'Blog', path: '/blog' },
  { label: 'Contact', path: '/contact' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Terms', path: '/terms' },
  { label: 'Features', path: '/features' },
  { label: 'Archetype Explorer', path: '/archetypes/explorer' },
];

test('all footer links return 200', async ({ request }) => {
  for (const link of footerLinks) {
    const response = await request.get(link.path);
    expect(response.status(), `${link.label} (${link.path}) should return 200`).toBe(200);
  }
});

test('footer links are present on homepage', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer).toBeVisible();

  for (const link of footerLinks) {
    const anchor = footer.locator(`a[href="${link.path}"]`);
    await expect(anchor, `footer link to ${link.path} should exist`).toBeVisible();
  }
});
