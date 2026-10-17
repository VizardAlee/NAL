import { test, expect } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

for (const width of [390, 1280]) test(`eligible annual profit can be requested from the dashboard at ${width}px`, async ({ page }) => {
  if (process.env.GCLOUD_PROJECT !== 'demo-nal-acceptance' ||
      !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Loopback demo fixtures only.');
  const app = initializeApp({ projectId: 'demo-nal-acceptance' }, `annual-ui-${width}`);
  const db = getFirestore(app);
  const batchId = `annual-ui-${width}`;
  const profitId = `${batchId}-profit`;
  const prior = new Set((await db.collection('withdrawalRequests').get()).docs.map(doc => doc.id));
  const opened = new Date(Date.now() - 86400000);
  const start = new Date(opened); start.setUTCFullYear(start.getUTCFullYear() - 1);
  try {
    await db.doc(`fundBatches/${batchId}`).set({ sourceId: 'investor', amount: 100, remainingAmount: 100, tenureValue: 3, tenureUnit: 'Years', createdAt: Timestamp.fromDate(start) });
    await db.doc(`transactions/${profitId}`).set({ userId: 'investor', type: 'ProfitDistribution', amount: 20, fundBatchId: batchId, createdAt: Timestamp.fromDate(new Date(opened.getTime() - 10 * 86400000)) });
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled({ timeout: 60_000 });
    await page.getByLabel('Email', { exact: true }).fill('investor@nal.test');
    await page.getByLabel('Password', { exact: true }).fill('Emulator-only-123!');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/investor\/dashboard/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Continue later', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Continue later', exact: true }).click();
    const annual = page.getByRole('button', { name: 'Withdraw Annual Profit', exact: true });
    await expect(annual).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toBeDisabled();
    await annual.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Remaining annual 20% allowance:.*4\.00/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Request Withdrawal', exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(annual).toBeDisabled({ timeout: 30_000 });
    const requests = (await db.collection('withdrawalRequests').where('investorId', '==', 'investor').get()).docs.filter(doc => !prior.has(doc.id));
    expect(requests).toHaveLength(1);
    expect(requests[0].data()).toMatchObject({ amount: 4, source: 'AnniversaryProfit', status: 'Pending', anniversaryWindowIds: [`${batchId}:year-1`] });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    for (const doc of (await db.collection('withdrawalRequests').get()).docs) if (!prior.has(doc.id)) await doc.ref.delete();
    await db.doc(`fundBatches/${batchId}`).delete(); await db.doc(`transactions/${profitId}`).delete();
    await deleteApp(app);
  }
});
