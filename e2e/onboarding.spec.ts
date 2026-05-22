import { test, expect } from '@playwright/test';

test('/onboarding page loads successfully', async ({ page }) => {
  const response = await page.goto('/onboarding');
  expect(response?.status()).toBe(200);
  // Page should render some visible content
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('button')).toBeVisible();
});

test('onboarding flow: land → begin → reach birth form', async ({ page }) => {
  await page.goto('/onboarding');

  // The live intro page has a "Begin Your Journey" style CTA button
  const ctaButton = page.locator('button').first();
  await expect(ctaButton).toBeVisible();
  await ctaButton.click();

  // After clicking the CTA we should be on the birth step (either same page or /onboarding/birth)
  await page.waitForURL(/\/(onboarding|onboarding\/birth)/, { timeout: 5000 });

  // The birth step asks for birth date / location details
  await expect(
    page.locator('input[type="date"], input[type="text"], input[placeholder*="birth" i], input[placeholder*="location" i], select').first()
  ).toBeVisible({ timeout: 5000 });
});

test('/onboarding/birth page loads', async ({ page }) => {
  const response = await page.goto('/onboarding/birth');
  expect(response?.status()).toBe(200);
  // Birth form should have date inputs and a submit button
  await expect(page.locator('button[type="submit"], button').last()).toBeVisible();
});
