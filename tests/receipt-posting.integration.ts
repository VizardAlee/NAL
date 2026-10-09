import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { prepareReceiptPosting } from '../src/lib/server/receipt-posting';
import { storeHistoricalDocument } from '../src/lib/server/historical-document-upload';
import { beginHistoricalExtraction, finishHistoricalExtraction, failHistoricalExtraction } from '../src/lib/server/historical-extraction-lock';
import { saveAdminUserRecord, storeAdminUserUpload } from '../src/lib/server/admin-user-records';
import { claimWhatsAppReminder, prepareWhatsAppReminders, previewWhatsAppReminder, recordWhatsAppSendResult, setWhatsAppConsent } from '../src/lib/server/whatsapp-reminder-outbox';
import { commitHistoricalWrites } from '../src/lib/server/historical-corrections';
import { createHash } from 'node:crypto';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('These tests require the Firestore emulator; never run against production.');
const app = initializeApp({ projectId:'demo-nal' });
const db = getFirestore(app);
before(async()=>{ await db.collection('bankEntries').doc('bank').set({date:'2026-09-30',amount:100,direction:'CREDIT',reference:'REF-1',description:'',accountNumber:'0513848871',allocatedAmount:0,reversed:false,confirmed:true}); });
beforeEach(async()=>{
  await db.collection('bankEntries').doc('bank').update({allocatedAmount:0});
  for(const id of ['receipt-a','receipt-b']) await db.collection('paymentReceipts').doc(id).set({purpose:'REPAYMENT',status:'RECONCILED',requestId:id,dealId:'deal',bankEntryId:'bank',fields:{amount:100,paymentDate:'2026-09-30',reference:'REF-1',sender:'Client',beneficiary:'NAL',accountNumber:'0513848871',transferStatus:'SUCCESSFUL'}});
});
after(async()=>{await deleteApp(app);});

const userEdit = { userId: 'editable-client', name: 'Test Client', reason: 'Correct bank details from evidence', governmentIdType: 'NIN', governmentIdNumber: '12345678901', bvn: '12345678901', bankName: 'Test Bank', bankAccountName: 'Test Client', bankAccountNumber: '0123456789', status: 'VERIFIED' };
test('concurrent historical imports cannot create duplicate normalized customer profiles', async()=>{
  for (const id of ['party-race-a','party-race-b']) await db.collection('historicalImports').doc(id).set({status:'POSTING',postingStartedBy:'admin'});
  const post=(id:string,name:string)=>commitHistoricalWrites(db,[
    {ref:db.collection('users').doc(id),data:{name,accessRole:'USER',personas:['CLIENT'],accountClaimStatus:'UNCLAIMED'}},
    {ref:db.collection('deals').doc(id),data:{clientId:id,principal:1000}},
    {ref:db.collection('historicalImports').doc(id),data:{status:'POSTED'},update:true},
  ],{importId:id,actor:'admin'});
  const results=await Promise.allSettled([post('party-race-a','Unique Legacy Customer'),post('party-race-b',' unique  legacy customer ')]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  const profiles=await Promise.all(['party-race-a','party-race-b'].map(id=>db.collection('users').doc(id).get()));
  const deals=await Promise.all(['party-race-a','party-race-b'].map(id=>db.collection('deals').doc(id).get()));
  assert.equal(profiles.filter(doc=>doc.exists).length,1);
  assert.equal(deals.filter(doc=>doc.exists).length,1);
});
test('live receipts cannot re-credit references or payments covered by historical cutoff', async () => {
  const claim=db.collection('historicalTransactionReferences').doc(createHash('sha256').update('REF-1').digest('hex'));
  await claim.set({rootImportId:'existing-import'});
  try { await assert.rejects(()=>db.runTransaction(trx=>prepareReceiptPosting(trx,{receiptId:'receipt-a',amount:100,purpose:'REPAYMENT'})),/already included in historical/); }
  finally { await claim.delete(); }
  await db.collection('deals').doc('cutoff-deal').set({importedAsOfDate:Timestamp.fromDate(new Date('2026-09-30T12:00:00Z'))});
  await db.collection('paymentReceipts').doc('receipt-a').update({dealId:'cutoff-deal'});
  await assert.rejects(()=>db.runTransaction(trx=>prepareReceiptPosting(trx,{receiptId:'receipt-a',amount:100,purpose:'REPAYMENT',dealId:'cutoff-deal'})),/predates the imported/);
  assert.equal((await db.collection('bankEntries').doc('bank').get()).data()?.allocatedAmount,0);
});
test('historical reference claims prevent duplicate posting atomically', async () => {
  for (const id of ['claim-a','claim-b']) await db.collection('historicalImports').doc(id).set({status:'POSTING',postingStartedBy:'admin'});
  const write = (id:string) => [{ref:db.collection('transactions').doc(id),data:{userId:'claim-investor',amount:100,type:'Deposit',paymentReference:'HISTORY-UNIQUE-REF',historicalImportId:id,createdAt:Timestamp.now()}},{ref:db.collection('historicalImports').doc(id),data:{status:'POSTED'},update:true}];
  await commitHistoricalWrites(db,write('claim-a'),{importId:'claim-a',actor:'admin'});
  await assert.rejects(()=>commitHistoricalWrites(db,write('claim-b'),{importId:'claim-b',actor:'admin'}),/already been posted/);
  assert.equal((await db.collection('transactions').doc('claim-b').get()).exists,false);
  await db.collection('paymentReceipts').doc('live-duplicate-history').set({status:'POSTED',fields:{reference:'LIVE-HISTORY-REF'}});
  await db.collection('historicalImports').doc('live-history-case').set({status:'POSTING',postingStartedBy:'admin'});
  await assert.rejects(()=>commitHistoricalWrites(db,[{ref:db.collection('transactions').doc('live-duplicate-import'),data:{userId:'claim-investor',amount:100,paymentReference:'LIVE-HISTORY-REF'}}],{importId:'live-history-case',actor:'admin'}),/already credited through receipt/);
  assert.equal((await db.collection('transactions').doc('live-duplicate-import').get()).exists,false);
});

test('independently approved historical correction preserves originals and appends offset entries', async () => {
  const source='correct-original'; const revision='correct-revision';
  await db.collection('historicalImports').doc(source).set({status:'POSTED',postedAt:Timestamp.now(),extraction:{fundPositions:[]}});
  await db.collection('historicalImports').doc(revision).set({status:'POSTING',postingStartedBy:'admin-b',correctionRootId:source,correctionRequestedBy:'admin-a',correctionReason:'Wrong recorded amount',correctionEvidence:'Bank statement confirmed amount'});
  const original=db.collection('transactions').doc('correct-original-deposit');
  await original.set({userId:'correction-investor',type:'Deposit',amount:100,createdAt:Timestamp.fromDate(new Date('2025-01-01')),historicalImportId:source});
  const repayment=db.collection('repayments').doc('correct-original-payment');
  await repayment.set({amount:50,status:'Approved',historicalImportId:source});
  await commitHistoricalWrites(db,[{ref:db.collection('transactions').doc('correct-new-deposit'),data:{userId:'correction-investor',type:'Deposit',amount:120,createdAt:Timestamp.fromDate(new Date('2025-01-01')),historicalImportId:revision}},{ref:db.collection('historicalImports').doc(revision),data:{status:'POSTED'},update:true}],{importId:revision,sourceId:source,actor:'admin-b'});
  assert.equal((await original.get()).data()?.amount,100);
  const entries=await db.collection('transactions').where('userId','==','correction-investor').get();
  assert.equal(entries.docs.reduce((sum,doc)=>sum+doc.data().amount,0),120);
  assert.equal((await repayment.get()).data()?.status,'Reversed');
  assert.equal((await db.collection('historicalImports').doc(source).get()).data()?.supersededBy,revision);
  const second='correct-second-revision';
  await db.collection('historicalImports').doc(revision).update({postedAt:Timestamp.now()});
  await db.collection('historicalImports').doc(second).set({status:'POSTING',postingStartedBy:'admin-b',correctionRootId:source,correctionRequestedBy:'admin-a',correctionReason:'Second evidenced correction',correctionEvidence:'Reconciled statement B'});
  await commitHistoricalWrites(db,[{ref:db.collection('transactions').doc('correct-second-deposit'),data:{userId:'correction-investor',type:'Deposit',amount:130,createdAt:Timestamp.fromDate(new Date('2025-01-01')),historicalImportId:second}},{ref:db.collection('historicalImports').doc(second),data:{status:'POSTED'},update:true}],{importId:second,sourceId:revision,actor:'admin-b'});
  const revisedEntries=await db.collection('transactions').where('userId','==','correction-investor').get();
  assert.equal(revisedEntries.docs.reduce((sum,doc)=>sum+doc.data().amount,0),130);
});

test('newer live activity blocks historical correction without partial writes', async () => {
  const source='busy-original'; const revision='busy-revision';
  await db.collection('historicalImports').doc(source).set({status:'POSTED',postedAt:Timestamp.fromDate(new Date('2026-01-01')),extraction:{fundPositions:[]}});
  await db.collection('historicalImports').doc(revision).set({status:'POSTING',postingStartedBy:'admin-b',correctionRequestedBy:'admin-a',correctionReason:'Correct opening figure',correctionEvidence:'Bank statement A'});
  await db.collection('transactions').doc('busy-live-payment').set({userId:'busy-investor',amount:10,createdAt:Timestamp.fromDate(new Date('2026-02-01'))});
  await assert.rejects(()=>commitHistoricalWrites(db,[{ref:db.collection('transactions').doc('busy-replacement'),data:{userId:'busy-investor',amount:100}}],{importId:revision,sourceId:source,actor:'admin-b'}),/Newer financial activity/);
  assert.equal((await db.collection('transactions').doc('busy-replacement').get()).exists,false);
  assert.equal((await db.collection('historicalImports').doc(source).get()).data()?.supersededBy,undefined);
});
test('sensitive admin corrections reset verified KYC, audit originals and reject stale saves', async () => {
  const user = db.collection('users').doc(userEdit.userId);
  const kyc = db.collection('userKycProfiles').doc(userEdit.userId);
  await user.set({ role: 'Client', name: userEdit.name, kycStatus: 'VERIFIED', balance: 500 });
  await kyc.set({ ...userEdit, bankName: 'Old Bank', revision: 0 });
  const result = await saveAdminUserRecord(db, 'admin', userEdit);
  assert.equal(result.verificationReset, true);
  assert.equal(result.status, 'SUBMITTED');
  const publicData = (await user.get()).data()!;
  assert.equal(publicData.bvnLast4, '8901');
  assert.equal(publicData.bvn, undefined);
  assert.equal(publicData.governmentIdNumber, undefined);
  assert.equal(publicData.balance, 500);
  const history = await kyc.collection('history').get();
  assert.equal(history.docs.at(-1)?.data().actorId, 'admin');
  assert.equal(history.docs.at(-1)?.data().previousKyc.bankName, 'Old Bank');
  await assert.rejects(() => saveAdminUserRecord(db, 'admin', userEdit), /Another update/);
  assert.equal((await saveAdminUserRecord(db, 'admin', { ...userEdit, revision: 1 })).status, 'VERIFIED');
});
test('investor verification requires TIN and cannot alter role or financial balances', async () => {
  await db.collection('users').doc('editable-investor').set({ role: 'Investor', name: 'Test Client' });
  await assert.rejects(() => saveAdminUserRecord(db, 'admin', { ...userEdit, userId: 'editable-investor' }), /TIN/);
  await assert.rejects(() => saveAdminUserRecord(db, 'admin', { ...userEdit, role: 'Admin' }), /Unrecognized/);
});
test('admin KYC replacements retain old files privately and clean up failed new uploads', async () => {
  const objects = new Map<string, { bytes: Buffer; options: any }>();
  const bucket = { name: 'demo-nal', file: (path: string) => ({ save: async (bytes: Buffer, options: any) => { objects.set(path, { bytes, options }); }, delete: async () => { objects.delete(path); } }) };
  const userId = 'upload-client';
  await db.collection('users').doc(userId).set({ name: 'Upload Client', kycStatus: 'VERIFIED' });
  const input = { userId, kind: 'GOVERNMENT_ID', reason: 'Updated identity evidence' };
  const first = await storeAdminUserUpload(db, bucket, 'admin', input, Buffer.from('%PDF-1.7\ntest'), 'id.pdf');
  await storeAdminUserUpload(db, bucket, 'admin', { ...input, replaceDocumentId: first.documentId }, Buffer.from('%PDF-1.7\nreplacement'), 'new-id.pdf');
  const record = (await db.collection('userKycProfiles').doc(userId).get()).data()!;
  assert.equal(record.documents.length, 1);
  assert.equal(record.status, 'SUBMITTED');
  assert.equal(objects.size, 2);
  for (const [path, object] of objects) {
    assert.ok(path.startsWith(`user-records/${userId}/`));
    assert.equal(object.options.metadata.metadata, undefined);
  }
  await assert.rejects(() => storeAdminUserUpload(db, bucket, 'admin', { ...input, replaceDocumentId: first.documentId }, Buffer.from('%PDF-1.7\nstale'), 'stale.pdf'), /cannot be replaced/);
  assert.equal(objects.size, 2);
  await assert.rejects(() => storeAdminUserUpload(db, bucket, 'admin', { ...input, kind: 'PROFILE_PHOTO' }, Buffer.from('%PDF-1.7\nphoto'), 'photo.pdf'), /JPG or PNG/);
});

test('organization corrections update entity and representative details without touching signed documents', async () => {
  const userId = 'editable-organization';
  await db.collection('users').doc(userId).set({ role: 'Client', accountType: 'Organization', name: 'Old Company', email: 'representative@example.com', agreements: ['signed-agreement'] });
  await saveAdminUserRecord(db, 'admin', { ...userEdit, userId, name: 'Correct Company', address: 'Registered office', organizationRegistrationNumber: 'RC123456', representativeName: 'Authorized Person', representativeTitle: 'Director', status: 'SUBMITTED' });
  const record = (await db.collection('users').doc(userId).get()).data()!;
  assert.equal(record.organizationName, 'Correct Company');
  assert.equal(record.organizationAddress, 'Registered office');
  assert.equal(record.representativeName, 'Authorized Person');
  assert.deepEqual(record.agreements, ['signed-agreement']);
  assert.equal(record.email, 'representative@example.com');
});

async function reminderFixture(clientId: string) {
  await db.doc('platformSettings/bankDetails').set({ accountName: 'NAL', accountNumber: '0513848871', bankName: 'Sterling Bank' });
  await db.doc('reminderSettings/whatsapp').set({ enabled: true });
  await db.collection('users').doc(clientId).set({ role: 'Client', name: 'Test Client', phoneNumber: '08032065880' });
  await db.collection('deals').doc(`${clientId}-deal`).set({ clientId, dealName: 'Test Facility', status: 'Active', financingMode: 'Murabaha', principal: 300, profitRate: 0, durationValue: 3, durationUnit: 'Days', repaymentType: 'Equal Installments', repaymentFrequency: 'Daily', startDate: Timestamp.fromDate(new Date('2026-09-30T00:00:00Z')) });
  await setWhatsAppConsent(db, 'admin', { clientId, optedIn: true, evidence: 'Client signed WhatsApp consent form', phone: '08032065880' });
}
const reminderNow = new Date('2026-10-02T15:00:00Z');
test('concurrent reminder preparation creates one daily outbox entry and never sends or changes balances', async () => {
  const clientId = 'whatsapp-concurrency';
  await reminderFixture(clientId);
  await db.collection('repayments').doc('legacy-only-deal-id').set({ dealId: `${clientId}-deal`, status: 'Approved', amount: 100, installmentNumber: 1 });
  const report = await previewWhatsAppReminder(db, clientId, reminderNow);
  assert.equal(report.amountPaid, 100); assert.equal(report.shortfall, 100);
  await Promise.all([prepareWhatsAppReminders(db, reminderNow), prepareWhatsAppReminders(db, reminderNow)]);
  const queue = await db.collection('whatsappReminderOutbox').where('clientId', '==', clientId).get();
  assert.equal(queue.size, 1); assert.equal(queue.docs[0].data().status, 'PREPARED');
  assert.equal(await claimWhatsAppReminder(db, queue.docs[0].id, false, reminderNow), null);
  assert.equal((await db.collection('deals').doc(`${clientId}-deal`).get()).data()?.principal, 300);
});
test('consent withdrawal and changed phone number prevent queued delivery', async () => {
  const clientId = 'whatsapp-revoked'; await reminderFixture(clientId);
  await prepareWhatsAppReminders(db, reminderNow);
  const queue = await db.collection('whatsappReminderOutbox').where('clientId', '==', clientId).get();
  await setWhatsAppConsent(db, 'admin', { clientId, optedIn: false, evidence: 'Client withdrew consent by phone' });
  assert.equal(await claimWhatsAppReminder(db, queue.docs[0].id, true, reminderNow), null);
  assert.equal((await queue.docs[0].ref.get()).data()?.status, 'CANCELLED');
  const second = 'whatsapp-phone-changed'; await reminderFixture(second); await prepareWhatsAppReminders(db, reminderNow);
  const secondQueue = await db.collection('whatsappReminderOutbox').where('clientId', '==', second).get();
  await db.collection('users').doc(second).update({ phoneNumber: '08011111111' });
  assert.equal(await claimWhatsAppReminder(db, secondQueue.docs[0].id, true, reminderNow), null);
});
test('provider claims refresh financial figures and uncertain sends cannot be claimed twice', async () => {
  const clientId = 'whatsapp-refresh'; await reminderFixture(clientId); await prepareWhatsAppReminders(db, reminderNow);
  const queue = await db.collection('whatsappReminderOutbox').where('clientId', '==', clientId).get();
  await db.collection('repayments').doc('freshly-approved').set({ clientId, dealId: `${clientId}-deal`, status: 'Approved', amount: 100, installmentNumber: 1 });
  const claims = await Promise.all([claimWhatsAppReminder(db, queue.docs[0].id, true, reminderNow), claimWhatsAppReminder(db, queue.docs[0].id, true, reminderNow)]);
  const sent = claims.find(Boolean)!;
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(sent.amountPaid, 100);
  await assert.rejects(() => recordWhatsAppSendResult(db, sent.outboxId, sent.attemptId, { status: 'SENT' }), /acknowledgement/);
  await recordWhatsAppSendResult(db, sent.outboxId, sent.attemptId, { status: 'UNKNOWN' });
  assert.equal(await claimWhatsAppReminder(db, sent.outboxId, true, reminderNow), null);
  assert.equal((await db.collection('whatsappDeliveryState').doc(clientId).get()).exists, false);
});
test('disabled configuration and completed facilities do not create reminders', async () => {
  const clientId = 'whatsapp-completed'; await reminderFixture(clientId);
  await db.collection('deals').doc(`${clientId}-deal`).update({ status: 'Completed' });
  await prepareWhatsAppReminders(db, reminderNow);
  assert.equal((await db.collection('whatsappReminderOutbox').where('clientId', '==', clientId).get()).size, 0);
  await db.doc('reminderSettings/whatsapp').set({ enabled: false });
  assert.deepEqual(await prepareWhatsAppReminders(db, reminderNow), { enabled: false, prepared: 0, skipped: 0, errors: 0 });
});

test('old queues expire and successful acknowledgements alone establish the next notice baseline', async () => {
  const clientId = 'whatsapp-baseline'; await reminderFixture(clientId); await prepareWhatsAppReminders(db, reminderNow);
  const queue = await db.collection('whatsappReminderOutbox').where('clientId', '==', clientId).get();
  const claim = (await claimWhatsAppReminder(db, queue.docs[0].id, true, reminderNow))!;
  await recordWhatsAppSendResult(db, claim.outboxId, claim.attemptId, { status: 'SENT', providerMessageId: 'test-meta-acknowledgement' });
  assert.equal((await db.collection('whatsappDeliveryState').doc(clientId).get()).data()?.amountPaid, 0);
  await assert.rejects(() => recordWhatsAppSendResult(db, claim.outboxId, claim.attemptId, { status: 'SENT', providerMessageId: 'test-meta-acknowledgement' }), /already completed/);
  const expires = 'whatsapp-expiry'; await reminderFixture(expires); await prepareWhatsAppReminders(db, reminderNow);
  const expired = await db.collection('whatsappReminderOutbox').where('clientId', '==', expires).get();
  assert.equal(await claimWhatsAppReminder(db, expired.docs[0].id, true, new Date('2026-10-03T15:00:00Z')), null);
  assert.equal((await expired.docs[0].ref.get()).data()?.status, 'CANCELLED');
  const closed = 'whatsapp-closed-after-preparation'; await reminderFixture(closed); await prepareWhatsAppReminders(db, reminderNow);
  const closedQueue = await db.collection('whatsappReminderOutbox').where('clientId', '==', closed).get();
  await db.collection('deals').doc(`${closed}-deal`).update({ status: 'Completed' });
  assert.equal(await claimWhatsAppReminder(db, closedQueue.docs[0].id, true, reminderNow), null);
  assert.equal((await closedQueue.docs[0].ref.get()).data()?.status, 'CANCELLED');
});

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
