import { expect, test } from '@playwright/test';

test('public entry points render and password reset is available', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/NAL/i);
  await page.goto('/login');
  await expect(page.getByRole('link', { name: /forgot your password/i })).toBeVisible();
  await page.goto('/forgot-password');
  await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
});

test('production security headers are emitted', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['strict-transport-security']).toContain('max-age=');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-powered-by']).toBeUndefined();
});

for (const portal of ['admin', 'owner', 'investor', 'client', 'marketer', 'legal', 'recovery']) {
  test(`unauthenticated ${portal} dashboard cannot expose portal content`, async ({ page }) => {
    await page.goto(`/${portal}/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
}
