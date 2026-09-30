import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { prepareReceiptPosting } from '../src/lib/server/receipt-posting';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('These tests require the Firestore emulator; never run against production.');
const app = initializeApp({ projectId:'demo-nal' });
const db = getFirestore(app);
before(async()=>{ await db.collection('bankEntries').doc('bank').set({date:'2026-09-30',amount:100,direction:'CREDIT',reference:'REF-1',description:'',accountNumber:'0513848871',allocatedAmount:0,reversed:false,confirmed:true}); });
beforeEach(async()=>{
  await db.collection('bankEntries').doc('bank').update({allocatedAmount:0});
  for(const id of ['receipt-a','receipt-b']) await db.collection('paymentReceipts').doc(id).set({purpose:'REPAYMENT',status:'RECONCILED',requestId:id,dealId:'deal',bankEntryId:'bank',fields:{amount:100,paymentDate:'2026-09-30',reference:'REF-1',sender:'Client',beneficiary:'NAL',accountNumber:'0513848871',transferStatus:'SUCCESSFUL'}});
});
after(async()=>{await deleteApp(app);});
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
