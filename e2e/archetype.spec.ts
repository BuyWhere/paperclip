import { test, expect } from '@playwright/test';

test('/archetypes/explorer page loads and shows archetypes', async ({ page }) => {
  const response = await page.goto('/archetypes/explorer');
  expect(response?.status()).toBe(200);

  await expect(page.locator('h1', { hasText: 'Archetype Explorer' })).toBeVisible();

  // Verify the 5 core archetypes are rendered
  const archetypes = [
    'Strategic Commander',
    'Nurturing Creative',
    'Steady Achiever',
    'Harmonizer Guardian',
    'Earth Anchor',
  ];

  for (const name of archetypes) {
    await expect(page.locator(`text=${name}`)).toBeVisible();
  }
});

test('/archetypes/explorer CTA links to /onboarding', async ({ page }) => {
  await page.goto('/archetypes/explorer');

  const ctaLink = page.locator('a', { hasText: 'Generate My Life OS — Free' });
  await expect(ctaLink).toBeVisible();
  await expect(ctaLink).toHaveAttribute('href', '/onboarding');
});

test('/archetypes/explorer back link works', async ({ page }) => {
  await page.goto('/archetypes/explorer');

  const backLink = page.locator('a', { hasText: '← Back to 8os' });
  await expect(backLink).toBeVisible();
  await backLink.click();
  await expect(page).toHaveURL('https://8os.ai/');
});
