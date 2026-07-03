import { test, expect } from '@playwright/test';

const EMAIL_INPUT = 'input#waitlist-email';
const SUBMIT_BUTTON = 'button[type="submit"]';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const emailInput = page.locator(EMAIL_INPUT);
  await emailInput.scrollIntoViewIfNeeded();
  await expect(emailInput).toBeVisible();
});

test('waitlist signup flow: land → enter email → submit → success', async ({ page }) => {
  const emailInput = page.locator(EMAIL_INPUT);
  const testEmail = `playwright-test-${Date.now()}@example.com`;

  await emailInput.fill(testEmail);
  await page.locator(SUBMIT_BUTTON, { hasText: 'Join Waitlist' }).click();

  // Success state replaces the form.
  await expect(page.locator('text=/You\'re #/i')).toBeVisible({ timeout: 10000 });
});

test('waitlist: empty submit shows inline "enter your email" error', async ({ page }) => {
  await page.locator(SUBMIT_BUTTON, { hasText: 'Join Waitlist' }).click();

  const error = page.locator('#waitlist-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText(/enter your email/i);
  // The form should still be there — no success state, no silent no-op.
  await expect(page.locator(EMAIL_INPUT)).toBeVisible();
  await expect(page.locator('text=/You\'re #/i')).not.toBeVisible();
});

test('waitlist: invalid email format shows inline validation error', async ({ page }) => {
  const emailInput = page.locator(EMAIL_INPUT);
  await emailInput.fill('not-a-real-email');
  await page.locator(SUBMIT_BUTTON, { hasText: 'Join Waitlist' }).click();

  const error = page.locator('#waitlist-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText(/valid email/i);
  // Input keeps its value so the user can fix it.
  await expect(emailInput).toHaveValue('not-a-real-email');
  // aria-invalid flips on the input.
  await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('text=/You\'re #/i')).not.toBeVisible();
});

test('waitlist: error clears as user edits the field', async ({ page }) => {
  const emailInput = page.locator(EMAIL_INPUT);
  await emailInput.fill('not-a-real-email');
  await page.locator(SUBMIT_BUTTON, { hasText: 'Join Waitlist' }).click();
  await expect(page.locator('#waitlist-error')).toBeVisible();

  // Typing should clear the error state.
  await emailInput.fill('better@example.com');
  await expect(page.locator('#waitlist-error')).not.toBeVisible();
});