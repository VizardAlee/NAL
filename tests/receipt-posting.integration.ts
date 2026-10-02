import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { prepareReceiptPosting } from '../src/lib/server/receipt-posting';
import { storeHistoricalDocument } from '../src/lib/server/historical-document-upload';
import { beginHistoricalExtraction, finishHistoricalExtraction, failHistoricalExtraction } from '../src/lib/server/historical-extraction-lock';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('These tests require the Firestore emulator; never run against production.');
const app = initializeApp({ projectId:'demo-nal' });
const db = getFirestore(app);
before(async()=>{ await db.collection('bankEntries').doc('bank').set({date:'2026-09-30',amount:100,direction:'CREDIT',reference:'REF-1',description:'',accountNumber:'0513848871',allocatedAmount:0,reversed:false,confirmed:true}); });
beforeEach(async()=>{
  await db.collection('bankEntries').doc('bank').update({allocatedAmount:0});
  for(const id of ['receipt-a','receipt-b']) await db.collection('paymentReceipts').doc(id).set({purpose:'REPAYMENT',status:'RECONCILED',requestId:id,dealId:'deal',bankEntryId:'bank',fields:{amount:100,paymentDate:'2026-09-30',reference:'REF-1',sender:'Client',beneficiary:'NAL',accountNumber:'0513848871',transferStatus:'SUCCESSFUL'}});
});
after(async()=>{await deleteApp(app);});

test('concurrent extraction attempts cannot both acquire a historical review', async () => {
  const ref = db.collection('historicalImports').doc('extraction-lock');
  await ref.set({ status: 'DRAFT', documents: [{ id: 'evidence' }] });
  const results = await Promise.allSettled([beginHistoricalExtraction(db, ref, 'attempt-a'), beginHistoricalExtraction(db, ref, 'attempt-b')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('late extraction completion and failure cannot overwrite posted records', async () => {
  const ref = db.collection('historicalImports').doc('extraction-posted');
  await ref.set({ status: 'POSTED', processingState: 'ANALYZING', processingAttemptId: 'old', extraction: { original: true } });
  await assert.rejects(() => finishHistoricalExtraction(db, ref, 'old', { extraction: { original: false } }), /superseded/);
  await failHistoricalExtraction(db, ref, 'old');
  const data = (await ref.get()).data()!;
  assert.equal(data.status, 'POSTED');
  assert.deepEqual(data.extraction, { original: true });
});

test('expired extraction can be restarted without stale results overwriting the retry', async () => {
  const ref = db.collection('historicalImports').doc('extraction-retry');
  await ref.set({ status: 'DRAFT', documents: [{ id: 'evidence' }], processingState: 'ANALYZING', processingAttemptId: 'old', processingStartedAt: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000) });
  await beginHistoricalExtraction(db, ref, 'retry');
  await assert.rejects(() => finishHistoricalExtraction(db, ref, 'old', { extraction: { old: true } }), /superseded/);
  await failHistoricalExtraction(db, ref, 'old');
  assert.equal((await ref.get()).data()?.processingAttemptId, 'retry');
  await finishHistoricalExtraction(db, ref, 'retry', { status: 'NEEDS_ATTENTION', extraction: { reviewed: false } });
  assert.equal((await ref.get()).data()?.processingState, 'COMPLETE');
});
const post = (receiptId: string, amount=100) => db.runTransaction(async trx=>{
  const write=await prepareReceiptPosting(trx,{receiptId,amount,purpose:'REPAYMENT',requestId:receiptId,dealId:'deal'});
  write();
  trx.set(db.collection('transactions').doc(receiptId),{amount});
});

test('concurrent receipts cannot consume the same bank funds twice',async()=>{
  const results=await Promise.allSettled([post('receipt-a'),post('receipt-b')]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await db.collection('bankEntries').doc('bank').get()).data()?.allocatedAmount,100);
});
test('retrying an already posted receipt cannot credit another financial entry',async()=>{
  await post('receipt-a');
  await assert.rejects(()=>post('receipt-a'),/reconciled/);
});
test('request amount and deal binding are checked before posting',async()=>{
  await assert.rejects(()=>post('receipt-a',99),/amounts do not match/);
  await assert.rejects(()=>db.runTransaction(async trx=>{await prepareReceiptPosting(trx,{receiptId:'receipt-a',amount:100,purpose:'REPAYMENT',dealId:'another-deal'});}),/different deal/);
  assert.equal((await db.collection('bankEntries').doc('bank').get()).data()?.allocatedAmount,0);
});
test('an approval failure rolls back receipt state and bank allocation together',async()=>{
  await assert.rejects(()=>db.runTransaction(async trx=>{
    const write=await prepareReceiptPosting(trx,{receiptId:'receipt-a',amount:100,purpose:'REPAYMENT',requestId:'receipt-a'});
    write();throw new Error('Financial eligibility failed');
  }),/eligibility failed/);
  assert.equal((await db.collection('paymentReceipts').doc('receipt-a').get()).data()?.status,'RECONCILED');
  assert.equal((await db.collection('bankEntries').doc('bank').get()).data()?.allocatedAmount,0);
});
test('partial allocations across separate receipts stop at the statement total',async()=>{
  await db.collection('paymentReceipts').doc('receipt-a').update({'fields.amount':40});
  await db.collection('paymentReceipts').doc('receipt-b').update({'fields.amount':60});
  await post('receipt-a',40);await post('receipt-b',60);
  assert.equal((await db.collection('bankEntries').doc('bank').get()).data()?.allocatedAmount,100);
});

test('historical uploads register private evidence atomically and retry without duplicates', async () => {
  const objects = new Map<string, Buffer>();
  const bucket = { file: (path: string) => ({ save: async (bytes: Buffer) => { objects.set(path, bytes); }, delete: async () => { objects.delete(path); } }) };
  const importId = 'server-upload';
  await db.collection('historicalImports').doc(importId).set({ status: 'DRAFT', documents: [] });
  await db.collection('platformSettings').doc('historicalImports').set({ enabled: true });
  const input = { importId, adminId: 'admin', originalName: 'agreement.pdf', bytes: Buffer.from('%PDF-historical-server-upload') };
  const first = await storeHistoricalDocument(db, bucket, input);
  const retry = await storeHistoricalDocument(db, bucket, input);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.documentId, first.documentId);
  assert.equal((await db.collection('historicalImports').doc(importId).get()).data()?.documents.length, 1);
  assert.equal(objects.size, 1);
});

test('concurrent historical uploads enforce the twelve-document cap and clean up rejected objects', async () => {
  const objects = new Map<string, Buffer>();
  const bucket = { file: (path: string) => ({ save: async (bytes: Buffer) => { objects.set(path, bytes); }, delete: async () => { objects.delete(path); } }) };
  const importId = 'upload-cap';
  await db.collection('historicalImports').doc(importId).set({ status: 'DRAFT', documents: Array.from({length:11}, (_,i) => ({id:`existing-${i}`})) });
  const outcomes = await Promise.allSettled([1,2].map(i => storeHistoricalDocument(db, bucket, {importId,adminId:'admin',originalName:'receipt.pdf',bytes:Buffer.from(`%PDF-cap-test-${i}`)})));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('historicalImports').doc(importId).get()).data()?.documents.length, 12);
  assert.equal(objects.size, 1);
});

test('closed, posted and posting imports cannot accept new evidence', async () => {
  let writes = 0;
  const bucket = { file: () => ({save:async () => {writes++;},delete:async () => {}}) };
  for (const status of ['POSTED','POSTING']) {
    await db.collection('historicalImports').doc('locked-upload').set({status,documents:[]});
    await assert.rejects(() => storeHistoricalDocument(db,bucket,{importId:'locked-upload',adminId:'admin',originalName:'document.pdf',bytes:Buffer.from('%PDF-locked')}), /cannot be changed/);
  }
  await db.collection('historicalImports').doc('locked-upload').set({status:'DRAFT',documents:[]});
  await db.collection('platformSettings').doc('historicalImports').set({enabled:false});
  await assert.rejects(() => storeHistoricalDocument(db,bucket,{importId:'locked-upload',adminId:'admin',originalName:'document.pdf',bytes:Buffer.from('%PDF-locked')}), /imports are closed/);
  assert.equal(writes,0);
  await db.collection('platformSettings').doc('historicalImports').set({enabled:true});
});
