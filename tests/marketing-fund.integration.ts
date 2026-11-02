import { createRequire } from 'node:module';
import { reconcileMarketingReceipt } from '../functions/src/marketing';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { adminDb as db, getAdminApp } from '../src/firebase/admin-app';
import { transferPlatformFundsAction } from '../src/app/admin/funds/actions';
import { allocateMarketingFundsAction, recordMarketingPayoutAction, reconcileMarketingReceiptsAction, assignDealMarketerAction, loadMarketingAdminAction } from '../src/app/admin/marketing/actions';
import { loadMarketerWorkspaceAction, recordMarketerFollowUpAction, getMarketerStats } from '../src/app/marketer/dashboard/actions';
import { prepareCommissionAccrual, prepareMarketingReplenishment } from '../src/lib/server/marketing-fund';
import { submitAuthenticatedSignatureAction } from '../src/app/signing/actions';
import { processRepaymentRequestAction, processTerminationRequestAction } from '../src/app/admin/approvals/actions';
import { agreementEnvelopeId } from '../src/lib/agreements/signing';

if(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!=='demo-nal-acceptance' || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS!=='true' || process.env.K_SERVICE || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(k=>!/^127\.0\.0\.1:\d+$/.test(process.env[k]||''))) throw new Error('Loopback demo emulators required. Production forbidden.');
const functionAdmin = createRequire(import.meta.url)(createRequire(import.meta.url).resolve('firebase-admin', { paths: [process.cwd() + '/functions'] }));
const tokens: Record<string,string> = {};
const event = (before: any, after: any, id = 'fictional-event') => reconcileMarketingReceipt.run({ id, data: { before: { data: () => before }, after: { data: () => after } } } as any);
const uid=(key:string)=>`marketing-${key}`;
const dealData=(marketer='one')=>({clientId:uid('client'),clientName:'Fictional Assigned Client',marketerId:uid(marketer),dealName:'Fictional Murabaha',marketingCommissionPolicy:1,financingMode:'Murabaha',principal:2000000,profitRate:50,durationValue:3,durationUnit:'Months',repaymentFrequency:'Monthly',repaymentType:'Equal Installments',startDate:Timestamp.now(),status:'Active',createdAt:Timestamp.now()});
const envelope={agreementType:'MURABAHA',sourceId:'m-deal',documentHash:'fictional-signed-hash',agreementReference:'FICTIONAL-SALE',documentModel:{type:'MURABAHA_SALE',client:{id:uid('client')},deal:{profit:1000000,contractPrice:3000000,profitRate:50}}};
async function accrue(id:string,extra:Record<string,unknown>={}) {
 await db.doc(`deals/${id}`).set({...dealData(),...extra});
 await db.runTransaction(async trx=>{const write=await prepareCommissionAccrual(trx,id,envelope);write();});
}
const commission=async(id:string)=>(await db.doc(`marketingCommissions/${id}`).get()).data()!;
const pool=async()=>Number((await db.doc('marketingPools/main').get()).data()?.balanceKobo || 0);
const allocate=(operationId:string,amount=100000,extra:Record<string,unknown>={})=>allocateMarketingFundsAction({authToken:tokens.admin,operationId,sourceBatchId:'m-source',sourceCategory:'RETAINED_EARNINGS',amount,reason:'Fictional retained company cash evidence',...extra});
const pay=(dealId:string,amount:number,operationId:string,reference=operationId)=>recordMarketingPayoutAction({authToken:tokens.admin,dealId,amount,operationId,reference});
const reconcile=(dealId:string)=>reconcileMarketingReceiptsAction({authToken:tokens.admin,dealId});
before(async()=>{
 if (!functionAdmin.apps.length) functionAdmin.initializeApp({ projectId:'demo-nal-acceptance' });
 for(const key of ['admin','owner','staff','one','two','client','outsider']){
  await getAuth(getAdminApp()).createUser({uid:uid(key),email:`${uid(key)}@nal.test`,password:'Emulator-only-123!',emailVerified:true});
  const accessRole=key==='admin'?'ADMIN':key==='owner'?'OWNER':key==='staff'?'STAFF':'USER';
  await db.doc('users/'+uid(key)).set({name:key==='client'?'Fictional Assigned Client':`Fictional ${key}`,email:`${uid(key)}@nal.test`,accessRole,personas:['one','two'].includes(key)?['MARKETER']:key==='client'?['CLIENT']:[],primaryPortal:['one','two'].includes(key)?'marketer':accessRole==='USER'?'client':accessRole==='OWNER'?'owner':'admin',phoneNumber:key==='client'?'08000000000':'',referredByCode:'legacy-code'});
  const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${uid(key)}@nal.test`,password:'Emulator-only-123!',returnSecureToken:true})});tokens[key]=(await r.json()).idToken;assert.ok(tokens[key]);
 }
 await db.doc('fundBatches/m-source').set({sourceId:'platform',amount:1000000,remainingAmount:1000000,createdAt:Timestamp.now()});
});
after(async()=>{if (functionAdmin.app() !== getAdminApp()) await functionAdmin.app().delete(); await getAdminApp().delete();});

test('unsigned and historical contracts do not receive retrospective obligations; final signed terms are immutable',async()=>{
 await accrue('m-historical',{marketingCommissionPolicy:0});assert.equal((await db.doc('marketingCommissions/m-historical').get()).exists,false);
 await accrue('m-imported',{historicalImportId:'fictional-history'});assert.equal((await db.doc('marketingCommissions/m-imported').get()).exists,false);
 await db.doc('deals/m-unsigned').set(dealData());assert.equal((await db.doc('marketingCommissions/m-unsigned').get()).exists,false);
 await accrue('m-fixed');await db.doc('deals/m-fixed').update({profitRate:99});
 await db.runTransaction(async trx=>(await prepareCommissionAccrual(trx,'m-fixed',envelope))());
 const fixed=await commission('m-fixed');assert.equal(fixed.agreedProfitKobo,100000000);assert.equal(fixed.earnedKobo,5000000);assert.equal(fixed.repaymentBasisKobo,300000000);assert.equal(fixed.profitRate,50);
});

test('final authenticated Murabaha signature accrues exactly once in its transaction',async()=>{
 const dealId='m-signed';await db.doc(`deals/${dealId}`).set(dealData());
 const ref=db.doc(`agreementEnvelopes/${agreementEnvelopeId('MURABAHA',dealId)}`);
 await ref.set({...envelope,sourceId:dealId,ownerUserId:uid('client'),status:'AWAITING_COMPANY',documentVersion:'fictional',requiredRoles:['CLIENT','NAL_AUTHORIZED_SIGNATORY'],signedRoles:['CLIENT'],signedByUserIds:[],startedAt:Timestamp.now(),updatedAt:Timestamp.now()});
 const bytes=Buffer.alloc(120,0);Buffer.from([0x89,0x50,0x4e,0x47]).copy(bytes);
 const result=await submitAuthenticatedSignatureAction({authToken:tokens.admin,agreementType:'MURABAHA',sourceId:dealId,role:'NAL_AUTHORIZED_SIGNATORY',signatureDataUrl:'data:image/png;base64,'+bytes.toString('base64'),consent:true});
 assert.equal(result.success,true,JSON.stringify(result));assert.equal((await ref.get()).data()?.status,'EXECUTED');assert.equal((await commission(dealId)).earnedKobo,5000000);
 const retry=await submitAuthenticatedSignatureAction({authToken:tokens.admin,agreementType:'MURABAHA',sourceId:dealId,role:'NAL_AUTHORIZED_SIGNATORY',signatureDataUrl:'data:image/png;base64,'+bytes.toString('base64'),consent:true});assert.equal(retry.success,false);assert.equal((await commission(dealId)).earnedKobo,5000000);
});

test('stale Platform Funds transfer cannot overwrite a committed marketing reservation',async()=>{
 const source=db.doc('fundBatches/m-transfer-race');await source.set({sourceId:'platform',amount:100000,remainingAmount:100000,createdAt:Timestamp.now()});
 await db.doc('fundBatches/m-source').update({remainingAmount:0});
 const staleUiBalance=(await source.get()).data()!.remainingAmount;assert.equal(staleUiBalance,100000);
 await allocate('m-transfer-reservation',60000,{sourceBatchId:'m-transfer-race'});
 assert.equal((await source.get()).data()?.remainingAmount,40000);
 const transfer=(operationId:string,amount:number,direction='fromInvestible',authToken=tokens.admin)=>transferPlatformFundsAction({authToken,operationId,amount,direction});
 // Deterministic interleaving from the review: UI reads 100k, marketing reserves
 // 60k, the stale form submits 80k. The server must reject against current 40k.
 await assert.rejects(()=>transfer('m-transfer-stale',80000),/Insufficient current/);
 assert.equal((await source.get()).data()?.remainingAmount,40000);assert.equal(await pool(),6000000);
 for(const role of ['one','owner','staff','client'])await assert.rejects(()=>transfer('m-transfer-denied-'+role,1,'fromInvestible',tokens[role]),/Forbidden/);
 await Promise.all([transfer('m-transfer-valid',40000),transfer('m-transfer-valid',40000)]);assert.equal((await source.get()).data()?.remainingAmount,0);
 await assert.rejects(()=>transfer('m-transfer-reserved',40000.01,'toInvestible'),/unreserved/);
 const result=await transfer('m-transfer-back',30000,'toInvestible');assert.ok(result.fundBatchId);
 const race=await Promise.allSettled([transfer('m-transfer-concurrent',20000),allocate('m-transfer-competing',20000,{sourceBatchId:result.fundBatchId!})]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.doc('fundBatches/'+result.fundBatchId).get()).data()?.remainingAmount,10000);
 // Restore only this test's fictional fixtures before the rest of the suite.
 for(const snapshot of (await db.collection('administrativeTransactions').get()).docs) if(String(snapshot.data().platformTransferId || snapshot.data().marketingOperationId || '').startsWith('m-transfer-'))await snapshot.ref.delete();
 for(const snapshot of (await db.collection('platformFundTransfers').get()).docs) if(snapshot.id.startsWith('m-transfer-'))await snapshot.ref.delete();
 for(const snapshot of (await db.collection('marketingOperations').get()).docs) if(snapshot.id.startsWith('m-transfer-'))await snapshot.ref.delete();
 await source.delete();await db.doc('fundBatches/'+result.fundBatchId).delete();await db.doc('fundBatches/m-source').update({remainingAmount:1000000});await db.doc('marketingPools/main').set({balanceKobo:0});
});

test('admin-only allocations cannot spend investor cash, cannot overdraft and are retry/concurrency safe',async()=>{
 for(const role of ['owner','staff','one','two','client','outsider'])await assert.rejects(()=>allocate('m-denied-'+role,1,{authToken:tokens[role]}),/Forbidden/);
 await db.doc('fundBatches/m-investor').set({sourceId:uid('client'),remainingAmount:999999});
 await assert.rejects(()=>allocate('m-investor-attempt',1,{sourceBatchId:'m-investor'}),/Insufficient/);
 await assert.rejects(()=>allocate('m-empty-attempt',1000001),/Insufficient/);
 await assert.rejects(()=>allocate('m-fraction-attempt',1.001));
 await Promise.all([allocate('m-allocation-one'),allocate('m-allocation-one')]);assert.equal(await pool(),10000000);
 assert.equal((await db.doc('fundBatches/m-source').get()).data()?.remainingAmount,900000);
 await assert.rejects(()=>allocate('m-allocation-one',1),/different data/);
 assert.equal((await db.collection('interAccountLoans').get()).size,0);
});

test('partial funding and late payment catchup use commission actually paid; duplicates remain idempotent',async()=>{
 await accrue('m-main');await db.doc('repayments/m-receipt').set({dealId:'m-main',clientId:uid('client'),status:'Approved',amount:300000});
 await pay('m-main',20000,'m-payment-partial');let c=await commission('m-main');assert.equal(c.fundedKobo,2000000);assert.equal(c.replenishedKobo,200000);
 const concurrent=await Promise.allSettled([pay('m-main',30000,'m-payment-rest'),pay('m-main',30000,'m-payment-rest')]);
 assert.ok(concurrent.some(result=>result.status==='fulfilled'),'A duplicate request must commit successfully.');
 // The emulator can close the losing read transaction with gRPC INVALID_ARGUMENT
 // instead of ABORTED. Model a client retry with the SAME idempotency key, never
 // accepting arbitrary failures or relaxing the exact ledger/balance assertions.
 for(const result of concurrent)if(result.status==='rejected'){
  assert.equal(result.reason?.code,3);assert.match(String(result.reason?.message),/Transaction is invalid or closed/);
  assert.equal((await commission('m-main')).fundedKobo,5000000);
  await pay('m-main',30000,'m-payment-rest');
 }
 c=await commission('m-main');assert.equal(c.fundedKobo,5000000);assert.equal(c.replenishedKobo,500000);
 await assert.rejects(()=>pay('m-main',1,'m-overpaid-test'),/exceeds/);
 await assert.rejects(()=>pay('m-fixed',1,'m-duplicate-ref','m-payment-rest'),/already been recorded/);
 await Promise.all([reconcile('m-main'),reconcile('m-main')]);assert.equal((await commission('m-main')).replenishedKobo,500000);
 const expenses=(await db.collection('administrativeTransactions').get()).docs.filter(d=>d.data().type==='Expense');assert.equal(expenses.length,2);assert.equal(expenses.reduce((s,d)=>s+d.data().amount,0),-50000);
});

test('half refund, full reversal, overpayment cap and three-receipt residual append adjustment history',async()=>{
 await db.doc('repayments/m-receipt').update({refundedAmount:150000});await reconcile('m-main');assert.equal((await commission('m-main')).replenishedKobo,250000);
 await db.doc('repayments/m-receipt').update({status:'Reversed'});await reconcile('m-main');assert.equal((await commission('m-main')).replenishedKobo,0);
 assert.equal((await db.doc('repayments/m-receipt').get()).data()?.amount,300000);
 for(let i=1;i<=3;i++){await db.doc(`repayments/m-third-${i}`).set({dealId:'m-main',status:'Approved',amount:1000000});await reconcile('m-main');assert.equal((await commission('m-main')).replenishedKobo,[1666667,3333333,5000000][i-1]);}
 await db.doc('repayments/m-overpay').set({dealId:'m-main',status:'Approved',amount:100000});await reconcile('m-main');assert.equal((await commission('m-main')).replenishedKobo,5000000);
 const events=await db.collection('marketingCommissions/m-main/events').get();assert.ok(events.docs.filter(d=>d.data().kind==='REPLENISHMENT').length>=7);assert.equal((await commission('m-main')).earnedKobo,5000000);
});

test('reversal after recovered money was reused records a deficit and leaves earned commission intact',async()=>{
 await accrue('m-reuse-a');await pay('m-reuse-a',50000,'m-reuse-payment-a');
 await accrue('m-reuse-b');await pay('m-reuse-b',50000,'m-reuse-payment-b');assert.equal(await pool(),0);
 for(let i=1;i<=3;i++)await db.doc(`repayments/m-third-${i}`).update({status:'Reversed'});
 await db.doc('repayments/m-overpay').update({status:'Refunded'});
 await reconcile('m-main');assert.equal(await pool(),-5000000);assert.equal((await commission('m-main')).replenishedKobo,0);assert.equal((await commission('m-main')).fundedKobo,5000000);
 await assert.rejects(()=>pay('m-fixed',1,'m-deficit-payment'),/insufficient funds/);
 await allocate('m-deficit-cover',100000);assert.equal(await pool(),5000000);
});

test('two simultaneous distinct payouts cannot overspend the pool or the obligation',async()=>{
 await accrue('m-race');
 const results=await Promise.allSettled([pay('m-race',40000,'m-race-payment-a'),pay('m-race',40000,'m-race-payment-b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await commission('m-race')).fundedKobo,4000000);assert.equal(await pool(),1000000);
});

test('terminated contract preserves paid and unpaid commission and permits future eligible collections',async()=>{
 await accrue('m-terminated');await db.doc('deals/m-terminated').update({status:'Terminated'});
 await pay('m-terminated',10000,'m-terminated-pay');assert.equal((await commission('m-terminated')).earnedKobo,5000000);
 await db.doc('repayments/m-termination-settlement').set({dealId:'m-terminated',status:'Approved',amount:300000});await reconcile('m-terminated');
 assert.equal((await commission('m-terminated')).replenishedKobo,100000);assert.equal((await commission('m-terminated')).earnedKobo-(await commission('m-terminated')).fundedKobo,4000000);
});

test('finance approvals replenish atomically without altering client charges, investor shares or settlement controls',async()=>{
 await allocate('m-approval-pool',50000);await accrue('m-finance');await pay('m-finance',50000,'m-finance-payout');
 await db.doc('investments/m-finance-investment').set({dealId:'m-finance',investorId:'fictional-investor',amount:2000000});
 await db.doc('bankEntries/m-finance-bank').set({date:'2026-11-02',amount:300000,direction:'CREDIT',reference:'FICTIONAL-FINANCE-RECEIPT',description:'Fictional cleared instalment',accountNumber:'0513848871',allocatedAmount:0,reversed:false,confirmed:true});
 await db.doc('paymentReceipts/m-finance-receipt').set({purpose:'REPAYMENT',status:'RECONCILED',requestId:'m-finance-payment',dealId:'m-finance',bankEntryId:'m-finance-bank',fields:{amount:300000,paymentDate:'2026-11-02',reference:'FICTIONAL-FINANCE-RECEIPT',sender:'Fictional client',beneficiary:'NAL',accountNumber:'0513848871',transferStatus:'SUCCESSFUL'}});
 await db.doc('repayments/m-finance-payment').set({dealId:'m-finance',clientId:uid('client'),amount:300000,installmentNumber:1,status:'Pending',receiptId:'m-finance-receipt',lodgedAt:Timestamp.now()});
 await assert.rejects(()=>processRepaymentRequestAction({authToken:tokens.one,requestId:'m-finance-payment',decision:'Approved'}),/Forbidden/);
 await processRepaymentRequestAction({authToken:tokens.admin,requestId:'m-finance-payment',decision:'Approved'});
 assert.equal((await commission('m-finance')).replenishedKobo,500000);
 const tx=(await db.collection('transactions').where('sourceRequestId','==','m-finance-payment').get()).docs.map(d=>d.data());
 assert.equal(tx.filter(d=>d.type==='Repayment').reduce((s,d)=>s+d.amount,0),-300000);
 assert.equal(tx.filter(d=>d.type==='ProfitDistribution').reduce((s,d)=>s+d.amount,0),40000);
 assert.equal(tx.filter(d=>d.type==='PlatformEarning').reduce((s,d)=>s+d.amount,0),60000);
 const cash=(await db.collection('fundBatches').where('sourceRequestId','==','m-finance-payment').get()).docs.filter(d=>d.data().sourceId==='platform');assert.equal(cash.reduce((s,d)=>s+d.data().remainingAmount,0),55000);
 assert.equal((await db.doc('bankEntries/m-finance-bank').get()).data()?.allocatedAmount,300000);
 assert.equal((await db.doc('paymentReceipts/m-finance-receipt').get()).data()?.status,'POSTED');
 await assert.rejects(()=>processRepaymentRequestAction({authToken:tokens.admin,requestId:'m-finance-payment',decision:'Approved'}),/already been processed/);
 await db.doc('terminationRequests/m-finance-termination').set({dealId:'m-finance',clientId:uid('client'),clientName:'Fictional Assigned Client',dealName:'Fictional Murabaha',status:'Pending'});
 await processTerminationRequestAction({authToken:tokens.admin,requestId:'m-finance-termination',decision:'Approved'});
 assert.equal((await commission('m-finance')).replenishedKobo,5000000);assert.equal((await commission('m-finance')).earnedKobo,5000000);
 assert.equal((await db.doc('deals/m-finance').get()).data()?.status,'Terminated');
 assert.equal((await db.doc('terminationRequests/m-finance-termination').get()).data()?.settlementAmount,2700000);
});

test('receipt-change Function corrects refunds and reversals automatically; stale pool cannot fund a payout',async()=>{
 await allocate('m-trigger-pool',100000);await accrue('m-trigger');await pay('m-trigger',50000,'m-trigger-payout');
 const original={dealId:'m-trigger',clientId:uid('client'),status:'Approved',amount:300000};
 const ref=db.doc('repayments/m-trigger-receipt');await ref.set(original);
 await assert.rejects(()=>pay('m-fixed',1,'m-stale-pool-attempt'),/reconciliation is pending/);
 await event(undefined,original,'fictional-created');assert.equal((await commission('m-trigger')).replenishedKobo,500000);
 const half={...original,refundedAmount:150000};await ref.set(half);
 await assert.rejects(()=>pay('m-fixed',1,'m-stale-refund-attempt'),/reconciliation is pending/);
 await Promise.all([event(original,half,'fictional-half-refund'),event(original,half,'fictional-half-refund')]);assert.equal((await commission('m-trigger')).replenishedKobo,250000);
 const balance=await pool();await event(undefined,original,'fictional-delayed-create');assert.equal(await pool(),balance);assert.equal((await commission('m-trigger')).replenishedKobo,250000);
 const reversed={...half,status:'Reversed'};await ref.set(reversed);await event(half,reversed,'fictional-reversed');assert.equal((await commission('m-trigger')).replenishedKobo,0);
 assert.equal((await ref.get()).data()?.amount,300000);assert.equal((await commission('m-trigger')).fundedKobo,5000000);
 await ref.set(original);await event(reversed,original,'fictional-restored');assert.equal((await commission('m-trigger')).replenishedKobo,500000);
 await ref.delete();await event(original,undefined,'fictional-deleted');assert.equal((await commission('m-trigger')).replenishedKobo,0);
});

test('cash-backing shortage never rejects a valid collection; retries recover the pending allocation safely',async()=>{
 await allocate('m-deferred-pool',50000);await accrue('m-deferred');await pay('m-deferred',50000,'m-deferred-payout');
 const sources=(await db.collection('fundBatches').where('sourceId','==','platform').get()).docs;
 for(const source of sources)await source.ref.update({remainingAmount:0});
 const receipt={dealId:'m-deferred',clientId:uid('client'),amount:300000,status:'Approved'};await db.doc('repayments/m-deferred-receipt').set(receipt);
 await db.runTransaction(async trx=>(await prepareMarketingReplenishment(trx,{dealId:'m-deferred',actorId:'fictional-finance',reason:'Valid cleared collection while backing unavailable',deferInsufficientCash:true})).write());
 let c=await commission('m-deferred');assert.equal(c.replenishedKobo,0);assert.equal(c.pendingReplenishmentKobo,500000);assert.equal((await db.doc('repayments/m-deferred-receipt').get()).data()?.status,'Approved');
 await assert.rejects(()=>pay('m-fixed',1,'m-deferred-stale-payment'),/reconciliation is pending/);
 await assert.rejects(()=>event(undefined,receipt,'fictional-deferred-event'),/Insufficient/);
 for(const source of sources)await source.ref.update({remainingAmount:source.data().remainingAmount});
 await event(undefined,receipt,'fictional-deferred-event');c=await commission('m-deferred');assert.equal(c.replenishedKobo,500000);assert.equal(c.pendingReplenishmentKobo,0);
 await event(undefined,receipt,'fictional-deferred-event');assert.equal((await commission('m-deferred')).replenishedKobo,500000);
});

test('marketer server APIs isolate clients, contracts and tasks; reassignment never transfers earned commission',async()=>{
 await db.doc(`deals/m-private-second-contract`).set({...dealData('two'),dealName:'Fictional Private Other Contract'});
 await db.doc('users/'+uid('one')).update({referralCode:'legacy-code'});
 await db.doc('recoveryTasks/m-task').set({dealId:'m-main',clientId:uid('client'),installmentNumber:1,amountOutstanding:70000,status:'OVERDUE',assigneeId:'different-recovery-officer'});
 await db.doc('recoveryTasks/m-private-task').set({dealId:'m-private-second-contract',clientId:uid('client'),installmentNumber:1,amountOutstanding:777777,status:'OVERDUE'});
 const one=await loadMarketerWorkspaceAction(tokens.one);assert.ok(one.clients.some(c=>c.dealId==='m-main'));assert.ok(!one.clients.some(c=>c.dealId==='m-private-second-contract'));assert.ok(!JSON.stringify(one).includes('777777'));
 assert.equal((await getMarketerStats({authToken:tokens.one,marketerId:uid('two')})).success,false);
 for(const role of ['client','outsider','owner','staff'])await assert.rejects(()=>loadMarketerWorkspaceAction(tokens[role]),/Forbidden/);
 await assert.rejects(()=>loadMarketingAdminAction(tokens.one),/Forbidden/);
 const contact={authToken:tokens.one,taskId:'m-task',operationId:'b91b1419-b8f0-445d-a1ec-bc60583cef30',notes:'Fictional phone promise recorded',outcome:'PROMISE_TO_PAY',nextActionAt:'2027-01-02T10:00:00.000Z',promiseAmount:10000,promiseDueAt:'2027-01-03T10:00:00.000Z'};
 await Promise.all([recordMarketerFollowUpAction(contact),recordMarketerFollowUpAction(contact)]);assert.equal((await db.collection('recoveryTasks/m-task/logs').get()).size,1);
 assert.equal((await db.doc('recoveryTasks/m-task').get()).data()?.assigneeId,'different-recovery-officer');
 await assert.rejects(()=>recordMarketerFollowUpAction({...contact,outcome:'PAYMENT_CONFIRMED'}));
 await assert.rejects(()=>recordMarketerFollowUpAction({...contact,taskId:'m-private-task'}),/not assigned/);
 const original=await commission('m-main');await assignDealMarketerAction({authToken:tokens.admin,dealId:'m-main',marketerId:uid('two')});
 await assert.rejects(()=>recordMarketerFollowUpAction(contact),/not assigned/);
 const reassigned=await loadMarketerWorkspaceAction(tokens.one);assert.ok(!reassigned.clients.some(c=>c.dealId==='m-main'));assert.equal(reassigned.commissions.find(c=>c.id==='m-main')?.dealName,'Previous assignment');
 const two=await loadMarketerWorkspaceAction(tokens.two);assert.ok(two.clients.some(c=>c.dealId==='m-main'));assert.ok(!two.commissions.some(c=>c.id==='m-main'));assert.equal((await commission('m-main')).marketerId,original.marketerId);
 await db.doc('users/'+uid('two')).update({personas:[]});await assert.rejects(()=>loadMarketerWorkspaceAction(tokens.two),/Forbidden/);await db.doc('users/'+uid('two')).update({personas:['MARKETER']});
 // Leave deterministic fictional fixtures for desktop/mobile acceptance.
 await assignDealMarketerAction({authToken:tokens.admin,dealId:'m-main',marketerId:uid('one')});
});
