import { test, expect } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// These browser fixtures are only ever created by the guarded acceptance runner.
test('reconciliation continues an empty search page and daily health shows stale and partial outcomes', async ({page}) => {
  if(process.env.GCLOUD_PROJECT !== 'demo-nal-acceptance' || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Loopback demo fixtures only');
  const app = initializeApp({projectId:'demo-nal-acceptance'},'operational-browser-fixture');
  const db = getFirestore(app); const health = db.doc('automationHealth/daily'); const previous = (await health.get()).data();
  const prefix = 'c'.repeat(60); const ids = Array.from({length:101},(_,i)=>prefix+i.toString(16).padStart(4,'0')); const target = 'd'.repeat(64);
  const batch = db.batch();
  for(const id of ids) batch.set(db.doc(`paymentReceipts/${id}`),{originalName:'Synthetic excluded receipt',status:'DRAFT',uploadedBy:'client',customerId:'client',fields:{reference:'excluded'}});
  batch.set(db.doc(`paymentReceipts/${target}`),{originalName:'Unique traversal target',status:'DRAFT',uploadedBy:'client',customerId:'client',fields:{reference:'unique-traversal'}});
  await batch.commit();
  await health.set({status:'HEALTHY',lastSucceededAt:Timestamp.fromMillis(Date.now()-3*86400000)});
  try {
    await page.goto('/login');
    await expect(page.getByRole('button',{name:'Login',exact:true})).toBeEnabled({timeout:60_000});
    await page.getByLabel('Email',{exact:true}).fill('admin@nal.test'); await page.getByLabel('Password',{exact:true}).fill('Emulator-only-123!');
    await page.getByRole('button',{name:'Login',exact:true}).click(); await expect(page).toHaveURL(/\/admin\/dashboard/,{timeout:60_000});
    await expect(page.getByRole('button',{name:'Continue later',exact:true})).toBeVisible({timeout:20_000}); await page.getByRole('button',{name:'Continue later',exact:true}).click();
    await expect(page.getByText('Stale success',{exact:true})).toBeVisible({timeout:60_000});
    await health.set({status:'FAILED',lastError:'Synthetic missing configuration',components:{recovery:{status:'SUCCEEDED'},ownerProfit:{status:'FAILED'},whatsappReminders:{status:'NOT_STARTED'}}});
    await expect(page.getByText('Partial failure',{exact:true})).toBeVisible({timeout:30_000});
    await expect(page.getByText('recovery: SUCCEEDED',{exact:true})).toBeVisible();
    await page.goto('/admin/reconciliation'); await page.getByRole('textbox',{name:'Search receipts',exact:true}).fill('unique-traversal');
    await expect(page.getByText('No matches in this loaded page. Continue the search.',{exact:true})).toBeVisible({timeout:60_000});
    await page.getByRole('button',{name:'Next',exact:true}).click();
    await expect(page.getByText('Unique traversal target',{exact:true})).toBeVisible({timeout:60_000});
    await expect(page.getByText(/All matching records loaded/)).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    const cleanup = db.batch(); for(const id of [...ids,target]) cleanup.delete(db.doc(`paymentReceipts/${id}`)); await cleanup.commit();
    if(previous) await health.set(previous); else await health.delete(); await deleteApp(app);
  }
});
