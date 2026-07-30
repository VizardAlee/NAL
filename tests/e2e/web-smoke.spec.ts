import { expect, test } from '@playwright/test';

test('public entry points render and password reset is available', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/NAL/i);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: /forgot your password/i })).toBeVisible();
  await page.goto('/forgot-password', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
});

test('production security headers are emitted', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['content-security-policy']).toContain('https://fonts.googleapis.com');
  expect(response.headers()['strict-transport-security']).toContain('max-age=');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-powered-by']).toBeUndefined();
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('PWA metadata and install assets are available', async ({ page, request }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon/);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon\.ico/);

  const manifestResponse = await request.get('/manifest.json');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192' }),
      expect.objectContaining({ sizes: '512x512' }),
      expect.objectContaining({ purpose: 'maskable' }),
    ])
  );

  const faviconResponse = await request.get('/favicon.ico?v=2');
  expect(faviconResponse.ok()).toBeTruthy();
  expect(faviconResponse.headers()['content-type']).toContain('image/');

  const serviceWorkerResponse = await request.get('/sw.js');
  expect(serviceWorkerResponse.ok()).toBeTruthy();
  expect(serviceWorkerResponse.headers()['service-worker-allowed']).toBe('/');
});

test('PWA serves the offline fallback without caching private portal data', async ({ page, context }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  try {
    await page.goto('/admin/deals');
    await expect(page.getByRole('heading', { name: /you are offline/i })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

for (const portal of ['admin', 'owner', 'investor', 'client', 'marketer', 'legal', 'recovery']) {
  test(`unauthenticated ${portal} dashboard cannot expose portal content`, async ({ page }) => {
    await page.goto(`/${portal}/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
}
