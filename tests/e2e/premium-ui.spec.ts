import { expect, test } from '@playwright/test';

test('mobile navigation closes, restores focus and supports repeated section visits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await menu.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(menu).toBeFocused();
  for (const [name, hash] of [['What we do', '#solutions'], ['Commercial models', '#models']]) {
    await menu.click();
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(hash + '$'));
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
});

test('mobile hero prioritizes its message and primary action without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const action = page.getByRole('link', { name: 'Explore our solutions' });
  const bounds = await action.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/premium-home-mobile.png' });
});

test('keyboard skip navigation and reduced motion remain available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).scrollBehavior)).toBe('auto');
  expect(await page.locator('.nal-reveal').first().evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});

for (const colorScheme of ['light', 'dark'] as const) test(`login supports validation and fits mobile in ${colorScheme} mode`, async ({ page }) => {
  await page.emulateMedia({ colorScheme });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Password must be at least 6 characters.')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'username');
  await page.getByLabel('Password', { exact: true }).fill('local-example-only');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Password', { exact: true }).fill('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `test-results/premium-login-${colorScheme}.png` });
});
