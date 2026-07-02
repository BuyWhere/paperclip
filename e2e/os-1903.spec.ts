import { test, expect } from '@playwright/test';

/**
 * OS-1903 browser verification — 3 bugs
 *
 * Bug 1: Dashboard throws "Something went wrong" when Cal.diy is unavailable
 * Bug 2: Birth-time AM/PM field shows "--" with no way to set it
 * Bug 3: Onboarding goal boxes are not clickable
 */

// ─── Bug 2: Birth page AM/PM ──────────────────────────────────────────────────
test('Bug 2: /onboarding/birth has AM/PM selector for birth time', async ({ page }) => {
  await page.goto('/onboarding/birth');
  await page.waitForLoadState('networkidle');

  // Enable "time known"
  const timeToggle = page.getByText('I know my birth time');
  if (await timeToggle.isVisible()) {
    await timeToggle.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: 'test-results/os1903-bug2-birth.png', fullPage: true });

  // Check for AM/PM selector in page content
  const pageContent = await page.content();
  const hasAmPm = pageContent.includes('AM') && pageContent.includes('PM');

  // Check for 12-hour hour options (values 1-12, not 0-23)
  const hourSelect = page.locator('select').nth(1); // second select = hour
  const hourOptions = await hourSelect.locator('option').allTextContents();
  const has12Hour = hourOptions.some(o => o.includes('12') || o.includes('01') || o.includes('02'));
  const has24HourOnly = hourOptions[0]?.trim() === '0' && hourOptions.includes('23');

  console.log(`Hour options: ${hourOptions.join(', ')}`);
  console.log(`hasAmPm=${hasAmPm}, has12Hour=${has12Hour}, has24HourOnly=${has24HourOnly}`);

  expect(has24HourOnly, 'Bug: 24-hour-only clock (0–23) with no AM/PM selector').toBe(false);
  expect(hasAmPm || has12Hour, 'AM/PM selector or 12-hour clock must be present').toBe(true);
});

// ─── Bug 3: Goals clickable ───────────────────────────────────────────────────
test('Bug 3: /onboarding/goals goal boxes are clickable and show selected state', async ({ page }) => {
  await page.goto('/onboarding/goals');
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: 'test-results/os1903-bug3-goals-before.png', fullPage: true });

  const goalButtons = page.locator('button[aria-pressed]');
  const goalCount = await goalButtons.count();
  console.log(`Found ${goalCount} goal buttons with aria-pressed`);

  if (goalCount === 0) {
    // Bug confirmed: no aria-pressed goal buttons exist
    await page.screenshot({ path: 'test-results/os1903-bug3-goals-page.png', fullPage: true });
    expect(goalCount, 'Bug 3: No aria-pressed goal buttons — goals are not clickable').toBeGreaterThan(0);
    return;
  }

  // Click first goal
  const isSelectedBefore = await goalButtons.first().getAttribute('aria-pressed');
  await goalButtons.first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/os1903-bug3-goals-after.png', fullPage: true });

  const isSelectedAfter = await goalButtons.first().getAttribute('aria-pressed');
  console.log(`aria-pressed: before=${isSelectedBefore}, after=${isSelectedAfter}`);
  expect(isSelectedAfter, `Goal should toggle to selected (aria-pressed=${isSelectedAfter})`).toBe('true');
});

// ─── Bug 1: Dashboard graceful degradation ────────────────────────────────────
test('Bug 1: /dashboard renders without crashing even if Cal.diy is unavailable', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'test-results/os1903-bug1-dashboard.png', fullPage: true });

  const hasCrash = consoleErrors.some(e =>
    e.includes('Unexpected error') ||
    e.includes('Application error') ||
    e.includes('Minified React Error') ||
    e.includes('Something went wrong')
  );

  const isRendered = await page.locator('body').isVisible();
  console.log(`Dashboard rendered=${isRendered}, console errors=${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log(`Errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
  }

  expect(isRendered, 'Dashboard should render visible content').toBe(true);
  expect(hasCrash, 'Dashboard should not crash with "Something went wrong"').toBe(false);
});
