import { expect, test } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const roles = ['admin','owner','staff','client','investor','legal','recovery','marketer'];
for (const role of roles) test(`${role} signs in to its permitted dashboard`, async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled({timeout:60_000});
  await page.getByLabel('Email', { exact:true }).fill(`${role}@nal.test`);
  await page.getByLabel('Password', { exact:true }).fill('Emulator-only-123!');
  await page.getByRole('button',{name:'Login',exact:true}).click();
  const portal=role==='staff'?'admin':role;
  await expect(page).toHaveURL(new RegExp(`/${portal}/dashboard`),{timeout:60_000});
  await expect(page.getByText('Application error:',{exact:false})).toHaveCount(0);
  if (!['admin','owner','staff'].includes(role)) {
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users/,{timeout:60_000});
  }
});

test('chart drawing, tabs and dialog cancellation preserve the emulator workspace', async ({ page }) => {
  if (process.env.GCLOUD_PROJECT !== 'demo-nal-acceptance' || !process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Emulators only.');
  const app = initializeApp({ projectId: 'demo-nal-acceptance' }, 'motion-fixture');
  const db = getFirestore(app);
  const fixtureIds = [0, 1, 2].map(i => `motion-batch-${i}`);
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled({ timeout: 60_000 });
    await page.getByLabel('Email', { exact: true }).fill('admin@nal.test');
    await page.getByLabel('Password', { exact: true }).fill('Emulator-only-123!');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Continue later', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Continue later', exact: true }).click();
    await expect(page.getByText('No fund batches yet', { exact: true })).toBeVisible({ timeout: 60_000 });
    const emptyHeight = await page.getByText('No fund batches yet', { exact: true }).locator('..').evaluate(el => el.getBoundingClientRect().height);
    expect(emptyHeight).toBe(320);
    await page.getByText('No fund batches yet', { exact: true }).locator('..').scrollIntoViewIfNeeded();
    for (let i = 0; i < 3; i++) {
      const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - i);
      await db.collection('fundBatches').doc(fixtureIds[i]).set({ sourceId: 'investor', amount: (i + 1) * 10000, remainingAmount: (i + 1) * 10000, createdAt: Timestamp.fromDate(date) });
    }
    const series = page.locator('.recharts-area');
    await expect(series).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => series.evaluate(el => el.getAnimations().length)).toBeGreaterThan(0);
    await page.screenshot({ path: '/tmp/nal-motion-chart-entry.png' });
    await page.waitForTimeout(300); // Sample the visual drawing, not a data interpolation.
    await page.screenshot({ path: '/tmp/nal-motion-chart-mid.png' });
    await expect.poll(() => series.evaluate(el => el.getAnimations().length)).toBe(0);
    await page.screenshot({ path: '/tmp/nal-motion-chart-complete.png' });
    // Data updates use their actual final geometry and do not replay the entrance.
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await db.collection('fundBatches').doc(fixtureIds[0]).update({ amount: 12000 });
    await expect.poll(() => series.evaluate(el => el.getAnimations().length)).toBe(0);
    await expect(page.locator('.recharts-area-curve')).toHaveAttribute('d', /.+/);
    await page.locator('.recharts-area-dot').last().hover();
    await expect(page.getByText('₦12,000.00', { exact: true }).last()).toBeVisible();
    await page.goto('/admin/reports');
    await expect(page.getByRole('heading', { name: 'Financial Reports', exact: true })).toBeVisible({ timeout: 60_000 });
    for (const name of ['Income Statement', 'Cash Flow', 'Balance Sheet', 'Income Statement']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel')).toBeVisible();
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('tab', { name: 'Cash Flow', exact: true }).click();
    await expect(page.locator('[data-chart]').first()).toBeVisible();
    await expect(page.locator('.recharts-bar').first()).toBeAttached();
    expect(await page.locator('.recharts-bar').evaluateAll(els => els.every(el => el.getAnimations().length === 0))).toBe(true);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management', exact: true })).toBeVisible({ timeout: 60_000 });
    const invite = page.getByRole('button', { name: /Invite User/ });
    await invite.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(invite).toBeFocused();
  } finally {
    await Promise.all(fixtureIds.map(id => db.collection('fundBatches').doc(id).delete()));
    await deleteApp(app);
  }
});

test('admin reviews a mixed historical bundle and posts one unclaimed client with agency and guarantee',async({page})=>{
  if (process.env.GCLOUD_PROJECT!=='demo-nal-acceptance' || !process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Emulators only.');
  await page.goto('/login');
  await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled({timeout:60_000});
  await page.getByLabel('Email',{exact:true}).fill('admin@nal.test');
  await page.getByLabel('Password',{exact:true}).fill('Emulator-only-123!');
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/,{timeout:60_000});
  await expect(page.getByRole('button',{name:'Continue later',exact:true})).toBeVisible({timeout:20_000});
  await page.getByRole('button',{name:'Continue later',exact:true}).click();
  await page.goto('/admin/historical-imports/mixed-agreement-bundle');
  await expect(page.getByText('People and accounts',{exact:true})).toBeVisible({timeout:60_000});
  await page.getByRole('combobox',{name:/^Account choice/}).selectOption('new');
  await page.getByRole('checkbox',{name:'I verified the customer identity and account choice. This is not a duplicate account.'}).check();
  for (const checkbox of await page.getByRole('checkbox',{name:/I verified the source and relationship/}).all()) await checkbox.check();
  await page.getByText('Document relationships',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/nal-history-relationships-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByText('People and accounts',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/nal-history-relationships-mobile.png'});
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button',{name:'Save and reconcile',exact:true}).click();
  await expect(page.getByRole('button',{name:'Approve and post',exact:true})).toBeEnabled({timeout:60_000});
  await page.getByRole('button',{name:'Approve and post',exact:true}).click();
  await page.getByRole('button',{name:'Post historical records',exact:true}).click();
  await expect(page.getByText('Historical records posted',{exact:true}).first()).toBeVisible({timeout:60_000});
  const app=initializeApp({projectId:'demo-nal-acceptance'},'inspect-history');
  try {
    const db=getFirestore(app);
    const review=(await db.collection('historicalImports').doc('mixed-agreement-bundle').get()).data()!;
    expect(review.status).toBe('POSTED');
    const deals=await db.collection('deals').where('historicalImportId','==','mixed-agreement-bundle').get();
    expect(deals.size).toBe(1);
    const deal=deals.docs[0].data();
    expect(deal.wakalahGranted).toBe(true);expect(deal.guarantorName).toBe('Synthetic Guarantor');
    const profile=(await db.collection('users').doc(deal.clientId).get()).data()!;
    expect(profile.accountClaimStatus).toBe('UNCLAIMED');expect(profile.representativeName).toBe('Representative Person');
    expect((await getAuth(app).getUser(deal.clientId)).disabled).toBe(true);
    expect(review.documents.find((doc:any)=>doc.id==='doc-sale').recipientUserIds).toEqual([deal.clientId]);
    expect(review.documents.find((doc:any)=>doc.id==='doc-investor').recipientUserIds).toEqual(['investor']);
    expect((await db.collection('repayments').where('historicalImportId','==','mixed-agreement-bundle').get()).size).toBe(0);
  } finally {await deleteApp(app);}
});

test('premium admin workspace remains usable across mobile and desktop', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByLabel('Email', { exact: true }).fill('admin@nal.test');
  await page.getByLabel('Password', { exact: true }).fill('Emulator-only-123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Continue later', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Continue later', exact: true }).click();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [path, title] of [['dashboard', 'Admin Dashboard'], ['users', 'User Management'], ['reports', 'Financial Reports']]) {
      await page.goto(`/admin/${path}`);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('#main-content')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Application error:', { exact: false })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/nal-premium-${path}-${width}.png`, fullPage: true });
    }
    if (width === 390) {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
  }
});

test('real emulator tokens enforce admin-only API writes', async ({ request }) => {
  let adminToken = '';
  for (const role of roles) {
    const response=await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-acceptance-key',{data:{email:`${role}@nal.test`,password:'Emulator-only-123!',returnSecureToken:true}});
    expect(response.ok()).toBeTruthy();
    const {idToken}=await response.json();
    if (role === 'admin') adminToken = idToken;
    const upload=await request.post('/api/admin-user-records',{headers:{Authorization:`Bearer ${idToken}`},multipart:{userId:'client',kind:'GOVERNMENT_ID',reason:'Acceptance only',file:{name:'id.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-acceptance')}}});
    expect(upload.status(),role).toBe(role==='admin'?200:403);
    expect((await upload.json()).success,role).toBe(role==='admin');
  }
  // Demote only the synthetic emulator profile; the old token still claims ADMIN.
  const demotion = await request.patch('http://127.0.0.1:8088/v1/projects/demo-nal-acceptance/databases/(default)/documents/users/admin?updateMask.fieldPaths=accessRole', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { fields: { accessRole: { stringValue: 'STAFF' } } },
  });
  expect(demotion.ok()).toBeTruthy();
  const staleTokenWrite = await request.post('/api/admin-user-records', {
    headers: { Authorization: `Bearer ${adminToken}` },
    multipart: { userId:'client',kind:'GOVERNMENT_ID',reason:'Stale token denial test',file:{name:'id.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-acceptance')} },
  });
  expect(staleTokenWrite.status()).toBe(403);
});
