import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, role: string) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel('Email', { exact: true }).fill(`${role}@nal.test`);
  await page.getByLabel('Password', { exact: true }).fill('Emulator-only-123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}/dashboard`), { timeout: 60_000 });
  const later = page.getByRole('button', { name: 'Continue later', exact: true });
  await expect(later).toBeVisible({ timeout: 20_000 });
  await later.click();
}

test('legacy termination URL returns a temporary server redirect and preserves query parameters', async ({ request }) => {
  const response = await request.get('/admin/terminations?from=legacy', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/admin/approvals/terminations?from=legacy');
});

for (const width of [390, 1280]) test(`termination legacy and canonical URLs render without router errors at ${width}px`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 844 });
  await login(page, 'admin');
  for (const path of ['/admin/terminations?from=legacy', '/admin/approvals/terminations']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/approvals\/terminations/);
    await expect(page.getByRole('heading', { name: 'Termination Approvals', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Application error:', { exact: false })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('legacy redirect retains the canonical portal authorization boundary', async ({ page }) => {
  await login(page, 'client');
  await page.goto('/admin/terminations');
  await expect(page).toHaveURL(/\/client\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Termination Approvals', exact: true })).toHaveCount(0);
});
