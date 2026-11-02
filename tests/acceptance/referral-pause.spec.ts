import { test, expect } from '@playwright/test';

test('no-code marketer sees usable deal reporting without a code prompt or invented referral totals', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled({ timeout: 60000 });
  await page.getByLabel('Email', { exact: true }).fill('marketer@nal.test');
  await page.getByLabel('Password', { exact: true }).fill('Emulator-only-123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/marketer\/dashboard/, { timeout: 60000 });
  const later = page.getByRole('button', { name: 'Continue later', exact: true });
  await expect(later).toBeVisible({ timeout: 20000 });
  await later.click();
  await expect(page.getByText('Commission earned', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Code', exact: true })).toHaveCount(0);
  await expect(page.getByText('No clients assigned to you yet.', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('No eligible signed commissions yet.', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/nal-referral-pause-marketer.png', fullPage: true });
});
