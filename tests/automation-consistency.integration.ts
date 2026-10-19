import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { adminDb as db, getAdminApp } from '../src/firebase/admin-app';
import { assessInvestorZakat } from '../src/lib/server/zakat-assessment';
import { processOwnerProfitAllocations } from '../src/lib/server/owner-profit';

if (process.env.GCLOUD_PROJECT !== 'demo-nal-acceptance' || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true' || process.env.K_SERVICE || ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'].some(k => !/^127\.0\.0\.1:\d+$/.test(process.env[k] || ''))) throw Error('Loopback demo emulators only');
before(async () => {
  for (const name of ['transactions', 'fundBatches', 'ownershipPartners', 'ownerProfitAllocations', 'automationCursors']) await db.recursiveDelete(db.collection(name));
});
after(async () => {
  for (const name of ['transactions', 'fundBatches', 'ownershipPartners', 'ownerProfitAllocations', 'automationCursors']) await db.recursiveDelete(db.collection(name));
  await db.doc('platformPolicies/ownerProfit').delete();
  await getAdminApp().delete();
});
const old = Timestamp.fromMillis(Date.now() - 400 * 86400000);
async function seed(id: string, amount: number) {
  await db.doc('platformSettings/zakat').set({ nisab: 1000 });
  await db.doc(`users/${id}`).set({ name: 'Synthetic', role: 'Investor', accessRole: 'USER', personas: ['INVESTOR'], isMuslim: true });
  await db.doc(`transactions/${id}`).set({ userId: id, type: 'Deposit', amount, createdAt: old });
  await db.doc(`fundBatches/${id}`).set({ sourceId: id, remainingAmount: amount, createdAt: old });
}
// Inject an actual SDK retry after staging the first assessment's writes. The
// ABORTED callback commits nothing. Interleave a synthetic ledger/cash change
// before the next callback's reads, then let the SDK commit normally.
async function retryWithChange(id: string, initial: number, delta: number) {
  await seed(id, initial);
  let attempts = 0;
  const wrapped = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return (callback: any) => target.runTransaction(async tx => {
      attempts++;
      if (attempts === 2) {
        const batch = target.batch();
        batch.set(target.doc(`transactions/${id}-change`), { userId: id, type: delta > 0 ? 'Deposit' : 'Withdrawal', amount: delta, createdAt: Timestamp.now() });
        batch.update(target.doc(`fundBatches/${id}`), { remainingAmount: initial + delta });
        await batch.commit();
      }
      const result = await callback(tx);
      if (attempts === 1) throw Object.assign(new Error('Synthetic contention'), { code: 10 });
      return result;
    });
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } }) as Firestore;
  const result = await assessInvestorZakat(wrapped, db.doc(`users/${id}`));
  assert.ok(attempts >= 2);
  return result;
}
for (const [label, initial, delta, expected] of [
  ['payable deposit', 2000, 1000, 75], ['payable withdrawal', 3000, -1000, 50],
  ['below Nisab deposit', 900, 1100, 50], ['cross below Nisab withdrawal', 2000, -1500, 0],
  ['below Nisab withdrawal', 900, -400, 0],
] as const) test(`Zakat retry recalculates ${label} and commits once`, async () => {
  const id = 'consistency-' + label.replaceAll(' ', '-');
  const result = await retryWithChange(id, initial, delta);
  assert.equal(result.amount, expected);
  assert.equal(result.status, expected ? 'paid' : 'belowNisab');
  const rows = await db.collection('transactions').where('userId', '==', id).where('type', '==', 'Zakat').get();
  assert.equal(rows.size, expected ? 1 : 0);
  if (expected) {
    assert.equal(rows.docs[0].data().metadata.portfolioValue, initial + delta);
    assert.equal(rows.docs[0].data().amount, -expected);
  }
  assert.equal((await db.doc(`fundBatches/${id}`).get()).data()!.remainingAmount, initial + delta - expected);
  assert.equal((await assessInvestorZakat(db, db.doc(`users/${id}`))).status, 'skipped');
  assert.ok((await db.doc(`users/${id}`).get()).data()!.lastZakatAssessmentDate);
});
test('overlapping Zakat assessments commit exactly one payment', async () => {
  const id = 'consistency-overlap'; await seed(id, 2000);
  const results = await Promise.all([assessInvestorZakat(db, db.doc(`users/${id}`)), assessInvestorZakat(db, db.doc(`users/${id}`))]);
  assert.equal(results.filter(r => r.status === 'paid').length, 1);
  assert.equal((await db.doc(`fundBatches/${id}`).get()).data()!.remainingAmount, 1950);
});
test('overlapping below-Nisab assessments record one annual assessment without a debit', async () => {
  const id = 'consistency-below-overlap'; await seed(id, 500);
  const results = await Promise.all([assessInvestorZakat(db, db.doc(`users/${id}`)), assessInvestorZakat(db, db.doc(`users/${id}`))]);
  assert.equal(results.filter(r => r.status === 'belowNisab').length, 1);
  assert.equal(results.filter(r => r.status === 'skipped').length, 1);
  assert.equal((await db.doc(`fundBatches/${id}`).get()).data()!.remainingAmount, 500);
  assert.equal((await db.collection('transactions').where('userId', '==', id).where('type', '==', 'Zakat').get()).size, 0);
});
test('Zakat preserves existing FIFO batch eligibility and rolls back if dated cash cannot cover the assessment', async () => {
  const id = 'consistency-undated-cash'; await seed(id, 2000);
  await db.doc(`fundBatches/${id}`).update({ createdAt: FieldValue.delete() });
  await assert.rejects(assessInvestorZakat(db, db.doc(`users/${id}`)), /Full Zakat amount/);
  assert.equal((await db.doc(`fundBatches/${id}`).get()).data()!.remainingAmount, 2000);
  assert.equal((await db.doc(`users/${id}`).get()).data()!.lastZakatAssessmentDate, undefined);
  assert.equal((await db.collection('transactions').where('userId', '==', id).where('type', '==', 'Zakat').get()).size, 0);
});
test('owner traversal passes 500+ exclusions, checkpoints a bounded sweep and retries cash failures', async () => {
  const start = Timestamp.fromMillis(old.toMillis() + 1000);
  await db.doc('platformPolicies/ownerProfit').set({ retainedPercent: 30, distributablePercent: 70, totalShares: 1, allocationStartDate: start });
  await db.doc('ownershipPartners/consistency-owner').set({ userId: 'consistency-owner', displayName: 'Synthetic', active: true, shareUnits: 1 });
  // > scan budget, tied dates exercise the document-ID cursor. The first 550
  // records are outside the policy period and must be excluded by query bounds.
  for (let offset = 0; offset < 2700; offset += 450) {
    const batch = db.batch();
    for (let i = offset; i < Math.min(2700, offset + 450); i++) batch.set(db.doc(`transactions/scan-${String(i).padStart(5, '0')}`), {
      userId: 'platform', type: 'PlatformEarning', amount: i % 2 ? 0 : 10,
      ownerAllocatable: false, ownerAllocationId: null, createdAt: i < 550 ? old : start,
    });
    await batch.commit();
  }
  const source = db.doc('transactions/zz-consistency-valid');
  await source.set({ userId: 'platform', type: 'PlatformEarning', amount: 100, ownerAllocatable: true, ownerAllocationId: null, createdAt: start });
  const before = JSON.stringify((await db.collection('transactions').where('ownerAllocatable', '==', false).where('ownerAllocationId', '==', null).get()).docs.map(d => [d.id, d.data()]));
  const first = await processOwnerProfitAllocations({ limit: 500 });
  assert.equal(first.scanned, 2000); assert.equal(first.processed, 0); assert.equal(first.hasMore, true);
  assert.equal(first.permanentlyExcluded, 2000);
  const failed = await processOwnerProfitAllocations({ limit: 500 });
  assert.equal(failed.retryableFailures, 1); assert.equal(failed.processed, 0);
  assert.equal((await source.get()).data()!.ownerAllocationId, null);
  assert.equal((await db.collection('ownerProfitAllocations').get()).size, 0);
  await db.doc('fundBatches/consistency-platform').set({ sourceId: 'platform', amount: 100, remainingAmount: 100, createdAt: start });
  assert.equal((await processOwnerProfitAllocations({ limit: 500 })).processed, 0); // start next bounded sweep
  const results = await Promise.all([processOwnerProfitAllocations({ limit: 500 }), processOwnerProfitAllocations({ limit: 500 })]);
  assert.equal(results.reduce((n, r) => n + r.processed, 0), 1);
  assert.ok(results.every(r => r.errors === 0));
  assert.equal((await db.collection('ownerProfitAllocations').get()).size, 1);
  assert.equal((await db.doc('fundBatches/consistency-platform').get()).data()!.remainingAmount, 30);
  const ownerCash = await db.collection('fundBatches').where('sourceId', '==', 'consistency-owner').get();
  assert.equal(ownerCash.size, 1); assert.equal(ownerCash.docs[0].data().remainingAmount, 70);
  assert.equal(JSON.stringify((await db.collection('transactions').where('ownerAllocatable', '==', false).where('ownerAllocationId', '==', null).get()).docs.map(d => [d.id, d.data()])), before);
  await processOwnerProfitAllocations({ limit: 500 }); await processOwnerProfitAllocations({ limit: 500 });
  assert.equal((await db.collection('ownerProfitAllocations').get()).size, 1);
  const future = db.doc('transactions/zz-future-out-of-range');
  await future.set({ userId: 'platform', type: 'PlatformEarning', amount: 10, ownerAllocatable: true, ownerAllocationId: null, createdAt: Timestamp.fromMillis(start.toMillis() + 10000) });
  const bounded = await processOwnerProfitAllocations({ limit: 500, fromDate: start.toDate(), toDate: new Date(start.toMillis() + 1) });
  assert.equal(bounded.processed, 0);
  assert.equal((await future.get()).data()!.ownerAllocationId, null);
  assert.equal((await db.doc('fundBatches/consistency-platform').get()).data()!.remainingAmount, 30);

});
