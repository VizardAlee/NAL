import { expect, test } from '@playwright/test';

test('scroll entrances enhance visible content once and release it on print', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const card = page.locator('#solutions .nal-reveal').nth(1);
  expect(await card.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => card.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
  await page.screenshot({ path: '/tmp/nal-motion-scroll-entry.png' });
  await page.waitForTimeout(250); // Capture the viewport reveal while it is still progressing.
  await page.screenshot({ path: '/tmp/nal-motion-scroll-mid.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.screenshot({ path: '/tmp/nal-motion-scroll-restored.png' });
  expect(await card.evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await card.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await page.locator('h1').scrollIntoViewIfNeeded();
  await card.scrollIntoViewIfNeeded();
  expect(await card.evaluate(el => el.getAnimations().length)).toBe(0);
});

test('landing content and actions remain available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore our solutions' })).toBeVisible();
  expect(await page.locator('.nal-reveal').evaluateAll(els => els.every(el => getComputedStyle(el).opacity === '1'))).toBe(true);
  await context.close();
});

test('route navigation, Back and Forward keep content and form input intact', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Client login', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  const email = page.getByLabel('Email', { exact: true });
  await email.fill('motion-check@nal.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-only');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(email).toHaveValue('motion-check@nal.test');
  await page.getByRole('link', { name: 'User guide', exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByText('Your NAL visual guide', { exact: true })).toBeVisible();
});

test('mobile sheet cancels safely during entry, with keyboard focus restored', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  for (let i = 0; i < 3; i++) {
    await menu.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate(el => getComputedStyle(el).animationDuration)).toBe('0.32s');
    await page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible();
    await expect(menu).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reduced motion cancels active entrances and leaves dropdowns operable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const card = page.locator('#solutions .nal-reveal').nth(1);
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => card.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => card.evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await card.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  expect(parseFloat(await page.getByRole('menu').evaluate(el => getComputedStyle(el).animationDuration))).toBeLessThan(0.001);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeFocused();
});
