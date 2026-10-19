import { recordedInvestmentCapitalLock } from '../src/lib/investment-maturity';
import { sendMessageAction } from '../src/app/common/actions/chat-actions';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { requireCallableAdmin } from '../functions/src/admin-access';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import { getAdminApp, adminDb as db } from '../src/firebase/admin-app';
import { verifyAuthToken } from '../src/lib/server/auth';
import { requestCapitalWithdrawalAction } from '../src/app/investor/dashboard/withdrawal-actions';
import { requestDepositAction } from '../src/app/investor/dashboard/deposit-actions';
import { requestDealAction } from '../src/app/client/deals/request/actions';
import { POST as fundDeal } from '../src/app/api/fund-deal/route';
import { POST as cron } from '../src/app/api/cron/route';
import { processDepositRequestAction, processRepaymentRequestAction, processWithdrawalRequestAction } from '../src/app/admin/approvals/actions';
import { startAgreementSigningAction, createExternalSigningInviteAction, submitAuthenticatedSignatureAction, submitExternalSignatureAction, loadExternalSigningAction } from '../src/app/signing/actions';
import { claimRecoveryCaseAction, addRecoveryLogAction, recordRecoveryContactAction, escalateRecoveryCaseAction, updateLegalCaseAction, createDemandNoticeAction, issueDemandNoticeAction, resolveLegalCaseAction } from '../src/app/recovery/dashboard/actions';
import { lodgePaymentAction } from '../src/app/client/dashboard/actions';
import { setRoleAction } from '../src/app/signup/role/actions';
import { updateAccessRoleAction } from '../src/app/admin/users/[userId]/actions';
import { getAdminUserRecordAction, saveAdminUserRecordAction } from '../src/app/admin/users/[userId]/record-actions';
import { updateProfileAction } from '../src/components/common-actions';
import { generateAmortizationSchedule } from '../src/lib/amortization';
import type { Deal } from '../src/lib/types';

const project = 'demo-nal-acceptance';
const originals = new Map<string, FirebaseFirestore.DocumentData | undefined>();
const createdAuth: string[] = [];
if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== project || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(key => !/^127\.0\.0\.1:\d+$/.test(process.env[key] || ''))) throw new Error('Disposable loopback project only; production is forbidden.');
const functionAdmin = createRequire(import.meta.url)(createRequire(import.meta.url).resolve('firebase-admin', { paths: [process.cwd() + '/functions'] }));
const tokens: Record<string,string> = {};
const signature = 'data:image/png;base64,' + readFileSync('public/icons/icon-192x192.png').toString('base64');
const roles = [['admin','ADMIN',[]],['admin2','ADMIN',[]],['owner','OWNER',[]],['staff','STAFF',[]],['none','USER',[]],['client','USER',['CLIENT']],['client2','USER',['CLIENT']],['investor','USER',['INVESTOR']],['recovery','USER',['RECOVERY']],['recovery2','USER',['RECOVERY']],['legal','USER',['LEGAL']],['legal2','USER',['LEGAL']],['marketer','USER',['MARKETER']]] as const;
before(async () => {
  const auth = getAuth(getAdminApp());
  functionAdmin.initializeApp({projectId:project});
  for (const [uid, accessRole, personas] of roles) {
    originals.set(uid,(await db.doc(`users/${uid}`).get()).data());
    try { await auth.createUser({ uid, email:`${uid}@nal.test`, password:'Emulator-only-123!', emailVerified:true }); createdAuth.push(uid); }
    catch (error) { if ((error as {code?:string}).code !== 'auth/uid-already-exists') throw error; }
    await db.doc(`users/${uid}`).set({ name:`Synthetic ${uid}`,email:`${uid}@nal.test`,address:'Synthetic residential address',phoneNumber:'08000000000',photoURL:signature,bankName:'Synthetic Bank',bankAccountName:`Synthetic ${uid}`,bankAccountNumber:'0000000000',role: ['admin','admin2','owner','staff','none'].includes(uid) ? 'Admin' : uid === 'investor' ? 'Investor' : uid.startsWith('client') ? 'Client' : uid.startsWith('legal') ? 'Legal' : uid.startsWith('recovery') ? 'Recovery' : 'Marketer',accessRole,personas,isMuslim:false });
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${uid}@nal.test`,password:'Emulator-only-123!',returnSecureToken:true})});
    tokens[uid] = (await response.json()).idToken;
  }
  await db.doc('platformSettings/bankDetails').set({accounts:[{id:'synthetic',bankName:'Synthetic Bank',accountName:'Synthetic NAL',accountNumber:'0000000000',active:true}],defaultAccountId:'synthetic'});
});
after(async () => {
  for (const collection of ['fundBatches','investments','transactions','deals','dealRequests','depositRequests','withdrawalRequests','reinvestmentRequests','repayments','notifications','bankEntries','paymentReceipts','agreementEnvelopes','agreementSigningInvites','recoveryTasks','customerRequestSubmissions','automationRuns','automationHealth']) {
    for (const doc of (await db.collection(collection).get()).docs) await db.recursiveDelete(doc.ref);
  }
  for (const [uid, profile] of originals) { if (profile) await db.doc(`users/${uid}`).set(profile); else await db.doc(`users/${uid}`).delete(); }
  for (const uid of createdAuth) await getAuth(getAdminApp()).deleteUser(uid);
  await db.doc('userKycProfiles/none').delete(); await db.doc('platformSettings/bankDetails').delete();
  await functionAdmin.app().delete();
  await getAdminApp().delete();
});
const deposit = (uid: string) => ({authToken:tokens[uid],amount:100,userId:uid,userName:'Untrusted submitted name',tenureValue:90,tenureUnit:'Days' as const,paymentDate:'2026-10-12'});
const proposal = (uid: string) => ({authToken:tokens[uid],dealName:'Synthetic financing',clientId:uid,clientName:'Untrusted submitted name',principal:100,profitRate:0,guarantorName:'Synthetic Guarantor',guarantorAddress:'Synthetic residential address',guarantorPhoneNumber:'08000000001',guarantorOccupation:'Synthetic occupation',guarantorPhotoURL:'https://firebasestorage.googleapis.com/synthetic',durationValue:2,durationUnit:'Days' as const,repaymentType:'Equal Installments' as const,repaymentFrequency:'Daily' as const});
async function funding(uid: string, id: string) { return fundDeal(new NextRequest('http://127.0.0.1/api/fund-deal',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${tokens[uid]}`},body:JSON.stringify({dealId:id})})); }
async function external(type: 'MUDARABA'|'MURABAHA'|'KAFAALAH', sourceId: string, role: 'GUARANTOR'|'WITNESS'|'WITNESS_1'|'WITNESS_2', actor: string) {
  const invite = await createExternalSigningInviteAction({authToken:tokens[actor],agreementType:type,sourceId,role});
  assert.equal(invite.success,true,JSON.stringify(invite)); if (!invite.success) throw Error(invite.message);
  const token = new URL(invite.signingUrl).pathname.split('/').pop()!;
  const result = await submitExternalSignatureAction({token,pin:invite.pin,signerName:role==='GUARANTOR'?'Synthetic Guarantor':`Synthetic ${role}`,signerPhoneNumber:'08000000001',signerAddress:'Synthetic witness address',signatureDataUrl:signature,consent:true});
  assert.equal(result.success,true,JSON.stringify(result));
  assert.equal((await loadExternalSigningAction({token})).success,false,'consumed links must be rejected');
}
async function company(type:'MUDARABA'|'MURABAHA'|'KAFAALAH', sourceId:string) {
  const signers = type==='KAFAALAH' ? [['admin','NAL_AUTHORIZED_SIGNATORY']] : [['admin','NAL_SIGNATORY_1'],['admin2','NAL_SIGNATORY_2']];
  for (const [actor,role] of signers) {
    const result=await submitAuthenticatedSignatureAction({authToken:tokens[actor],agreementType:type,sourceId,role:role as never,signatureDataUrl:signature,consent:true});
    assert.equal(result.success,true,JSON.stringify(result));
  }
  const envelope=(await db.doc(`agreementEnvelopes/${type.toLowerCase()}_${sourceId}`).get()).data()!;
  assert.equal(envelope.status,'EXECUTED');assert.equal(envelope.finalPdfArchive.status,'ARCHIVED');assert.match(envelope.finalPdfArchive.fileHash,/^[a-f0-9]{64}$/);
}

test('unassigned roles, wrong customer identity, and self-role escalation are denied without requests',async()=>{
  for(const uid of ['none','staff','owner','recovery','legal','marketer']) assert.equal((await requestDepositAction(deposit(uid))).success,false,uid);
  assert.equal((await requestDealAction(proposal('none'))).success,false);
  assert.equal((await requestDealAction({...proposal('client'),clientId:'client2'})).success,false);
  await db.doc('userKycProfiles/none').set({status:'VERIFIED'});
  const form=new FormData();form.set('role','Investor');form.set('userId','none');form.set('authToken',tokens.none);form.set('isMuslim','false');
  assert.equal((await setRoleAction({},form)).success,false);
  assert.equal((await db.collection('depositRequests').get()).size,0);
});
test('production verification requests revoked checks explicitly, and real disabled emulator tokens fail',async()=>{
  const auth=getAuth(getAdminApp());const original=auth.verifyIdToken;
  let checked=false;auth.verifyIdToken=async (_token,checkRevoked)=>{checked=checkRevoked===true;throw Object.assign(new Error('synthetic revoked'),{code:'auth/id-token-revoked'});};
  try {await assert.rejects(verifyAuthToken('synthetic'),/invalid auth token/);assert.equal(checked,true);}finally{auth.verifyIdToken=original;}
  await auth.updateUser('none',{disabled:true});await assert.rejects(verifyAuthToken(tokens.none),/invalid auth token/);await auth.updateUser('none',{disabled:false});
});
test('callables reject stale legacy Admin labels for Owner, Staff and demoted User before any forwarding',async()=>{
  for(const uid of ['owner','staff','none']) await assert.rejects(requireCallableAdmin({auth:{uid,token:{accessRole:'ADMIN'}},rawRequest:{headers:{authorization:`Bearer ${tokens[uid]}`}}} as never),/Administrator write access/);
  assert.equal(await requireCallableAdmin({auth:{uid:'admin',token:{}},rawRequest:{headers:{authorization:`Bearer ${tokens.admin}`}}} as never),'admin');
});
test('concurrent customer request retries store one record with authoritative customer name',async()=>{
  const results=await Promise.all(Array.from({length:5},()=>requestDealAction(proposal('client'))));assert.ok(results.every(r=>r.success));
  const requests=await db.collection('dealRequests').where('clientId','==','client').get();assert.equal(requests.size,1);assert.equal(requests.docs[0].data().clientName,'Synthetic client');
  const deposits=await Promise.all(Array.from({length:5},()=>requestDepositAction(deposit('investor'))));assert.ok(deposits.every(r=>r.success));assert.equal((await db.collection('depositRequests').where('investorId','==','investor').get()).size,1);
});
test('investor contribution requires full signing, bank evidence, and one concurrent approval',async()=>{
  const snapshot=await db.collection('depositRequests').where('investorId','==','investor').get();const id=snapshot.docs[0].id;
  await assert.rejects(processDepositRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'}),/agreement/i);
  const start=await startAgreementSigningAction({authToken:tokens.investor,agreementType:'MUDARABA',sourceId:id});assert.equal(start.success,true,JSON.stringify(start));
  const envelopeRef=db.doc(`agreementEnvelopes/mudaraba_${id}`);
  const beforeInvite=(await envelopeRef.get()).data();
  for(const actor of ['owner','staff']) assert.equal((await createExternalSigningInviteAction({authToken:tokens[actor],agreementType:'MUDARABA',sourceId:id,role:'WITNESS_1'})).success,false);
  await db.doc('users/investor').update({personas:[]});
  assert.equal((await createExternalSigningInviteAction({authToken:tokens.investor,agreementType:'MUDARABA',sourceId:id,role:'WITNESS_1'})).success,false);
  assert.deepEqual((await envelopeRef.get()).data(),beforeInvite);
  await db.doc('users/investor').update({personas:['INVESTOR']});
  assert.equal((await submitAuthenticatedSignatureAction({authToken:tokens.investor,agreementType:'MUDARABA',sourceId:id,role:'INVESTOR',signatureDataUrl:signature,consent:true})).success,true);
  await external('MUDARABA',id,'WITNESS_1','investor');await external('MUDARABA',id,'WITNESS_2','investor');await company('MUDARABA',id);
  await db.doc('bankEntries/deposit-bank').set({date:'2026-10-12',amount:100,direction:'CREDIT',reference:'SYNTHETIC-DEP',description:'Synthetic',accountNumber:'0000000000',allocatedAmount:0,reversed:false,confirmed:true});
  await db.doc('paymentReceipts/deposit-receipt').set({purpose:'INVESTOR_CONTRIBUTION',status:'RECONCILED',requestId:id,bankEntryId:'deposit-bank',fields:{amount:100,paymentDate:'2026-10-12',reference:'SYNTHETIC-DEP',accountNumber:'0000000000',transferStatus:'SUCCESSFUL'}});
  await db.doc('depositRequests/'+id).update({receiptId:'deposit-receipt'});
  const results=await Promise.allSettled([processDepositRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'}),processDepositRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await db.doc('fundBatches/'+id).get()).data()!.principalLockedUntil.toDate().getTime(),recordedInvestmentCapitalLock((await envelopeRef.get()).data()!.documentModel.maturityDate).getTime());
  assert.equal((await db.doc('fundBatches/'+id).get()).data()!.remainingAmount,100);assert.equal((await db.doc('bankEntries/deposit-bank').get()).data()!.allocatedAmount,100);assert.equal((await db.collection('transactions').where('sourceRequestId','==',id).get()).size,1);
});
test('unsigned funding is denied; signed Murabaha/Kafaalah funding and partial repayment preserve balances',async()=>{
  const now=Timestamp.now();const deal={...proposal('client'),authToken:undefined,createdAt:now,startDate:now,status:'Pending',clientName:'Synthetic client',financingMode:'Murabaha',guarantorPhotoURL:signature,wakalahAssetDescription:'Synthetic test asset',requiresManagementFee:false,managementFeeRate:0,agreementSigningRequired:true};delete (deal as any).authToken;
  await db.doc('deals/workflow-deal').set(deal);
  for(const uid of ['owner','staff','none'])assert.equal((await funding(uid,'workflow-deal')).status,403);
  const blocked=await funding('admin','workflow-deal');assert.equal(blocked.status,500);assert.match((await blocked.json()).message,/agreements/i);
  for(const type of ['MURABAHA','KAFAALAH'] as const){assert.equal((await startAgreementSigningAction({authToken:tokens.client,agreementType:type,sourceId:'workflow-deal'})).success,true);
    if(type==='MURABAHA')assert.equal((await submitAuthenticatedSignatureAction({authToken:tokens.client,agreementType:type,sourceId:'workflow-deal',role:'CLIENT',signatureDataUrl:signature,consent:true})).success,true);
    await external(type,'workflow-deal','GUARANTOR','client');await external(type,'workflow-deal','WITNESS','client');await company(type,'workflow-deal');
  }
  assert.equal((await funding('admin','workflow-deal')).status,200);assert.equal((await db.doc('deals/workflow-deal').get()).data()!.status,'Active');assert.equal((await db.collection('investments').where('dealId','==','workflow-deal').get()).docs.reduce((n,d)=>n+d.data().amount,0),100);
  const active=(await db.doc('deals/workflow-deal').get()).data()!;const schedule=generateAmortizationSchedule({id:'workflow-deal',...active} as Deal);
  const form=new FormData();for(const [k,v] of Object.entries({authToken:tokens.client,dealId:'workflow-deal',userId:'client',amount:'25',dueDate:schedule[0].dueDate.toISOString(),installmentNumber:'1'}))form.set(k,v);
  assert.equal((await lodgePaymentAction({success:false,message:''},form)).success,true);assert.equal((await lodgePaymentAction({success:false,message:''},form)).success,false);
  const request=(await db.collection('repayments').where('dealId','==','workflow-deal').get()).docs[0];
  await db.doc('bankEntries/repayment-bank').set({date:'2026-10-12',amount:25,direction:'CREDIT',reference:'SYNTHETIC-REPAY',description:'Synthetic',accountNumber:'0000000000',allocatedAmount:0,reversed:false,confirmed:true});
  await db.doc('paymentReceipts/repayment-receipt').set({purpose:'REPAYMENT',status:'RECONCILED',requestId:request.id,dealId:'workflow-deal',bankEntryId:'repayment-bank',fields:{amount:25,paymentDate:'2026-10-12',reference:'SYNTHETIC-REPAY',accountNumber:'0000000000',transferStatus:'SUCCESSFUL'}});await request.ref.update({receiptId:'repayment-receipt'});
  const approvals=await Promise.allSettled([processRepaymentRequestAction({authToken:tokens.admin,requestId:request.id,decision:'Approved'}),processRepaymentRequestAction({authToken:tokens.admin,requestId:request.id,decision:'Approved'})]);assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);assert.equal((await request.ref.get()).data()!.status,'Approved');assert.equal((await db.doc('bankEntries/repayment-bank').get()).data()!.allocatedAmount,25);
});
test('capital withdrawal respects recorded contracts, deduplicates retries and deducts the requested legacy batch only',async()=>{
  const old = Timestamp.fromDate(new Date(Date.now()-40*86400000));
  await db.doc('fundBatches/signed-capital').set({sourceId:'investor',amount:100,remainingAmount:100,createdAt:old,tenureValue:90,tenureUnit:'Days'});
  await db.doc('agreementEnvelopes/mudaraba_signed-capital').set({status:'EXECUTED',documentModel:{maturityDate:new Date(Date.now()+50*86400000).toISOString()}});
  const input={authToken:tokens.investor,batchId:'signed-capital',userId:'investor',userName:'Synthetic investor'};
  assert.equal((await requestCapitalWithdrawalAction(input)).success,false);
  await db.doc('fundBatches/legacy-capital').set({sourceId:'investor',amount:50,remainingAmount:50,createdAt:old,tenureValue:90,tenureUnit:'Days'});
  const results=await Promise.all(Array.from({length:4},()=>requestCapitalWithdrawalAction({...input,batchId:'legacy-capital'})));assert.ok(results.every(r=>r.success));
  const requests=await db.collection('withdrawalRequests').where('fundBatchId','==','legacy-capital').get();assert.equal(requests.size,1);
  await processWithdrawalRequestAction({authToken:tokens.admin,requestId:requests.docs[0].id,decision:'Approved'});
  assert.equal((await db.doc('fundBatches/legacy-capital').get()).data()!.remainingAmount,0);assert.equal((await db.doc('fundBatches/signed-capital').get()).data()!.remainingAmount,100);
});
test('parallel incorrect signing PINs lock the invite and a correct PIN cannot bypass the lock',async()=>{
  const deal=(await db.doc('deals/workflow-deal').get()).data()!;await db.doc('deals/signing-lock-fixture').set({...deal,status:'Pending'});
  assert.equal((await startAgreementSigningAction({authToken:tokens.client,agreementType:'KAFAALAH',sourceId:'signing-lock-fixture'})).success,true);
  const invite=await createExternalSigningInviteAction({authToken:tokens.client,agreementType:'KAFAALAH',sourceId:'signing-lock-fixture',role:'GUARANTOR'});assert.equal(invite.success,true);if(!invite.success)throw Error(invite.message);
  const token=new URL(invite.signingUrl).pathname.split('/').pop()!;const input={token,pin:invite.pin==='000000'?'111111':'000000',signerName:'Synthetic Guarantor',signerPhoneNumber:'08000000001',signerAddress:'Synthetic witness address',signatureDataUrl:signature,consent:true as const};
  const results=await Promise.all(Array.from({length:5},()=>submitExternalSignatureAction(input)));assert.ok(results.every(r=>!r.success));
  assert.equal((await submitExternalSignatureAction({...input,pin:invite.pin})).success,false);
});
test('Recovery claim race, promise, Legal handoff, reviewed demand and closure enforce ownership',async()=>{
  await db.doc('recoveryTasks/workflow-case').set({clientId:'client',clientName:'Synthetic client',dealId:'workflow-deal',dealName:'Synthetic test deal',status:'OVERDUE',assigneeId:null,amountOutstanding:75,dueDate:Timestamp.now()});
  assert.equal((await addRecoveryLogAction({authToken:tokens.recovery,taskId:'workflow-case',logText:'Before claim'})).success,false);
  const claims=await Promise.all([claimRecoveryCaseAction({authToken:tokens.recovery,taskId:'workflow-case'}),claimRecoveryCaseAction({authToken:tokens.recovery2,taskId:'workflow-case'})]);assert.equal(claims.filter(r=>r.success).length,1);
  const actor=(await db.doc('recoveryTasks/workflow-case').get()).data()!.assigneeId;const other=actor==='recovery'?'recovery2':'recovery';
  assert.equal((await addRecoveryLogAction({authToken:tokens[other],taskId:'workflow-case',logText:'Wrong officer'})).success,false);
  assert.equal((await recordRecoveryContactAction({authToken:tokens[actor],taskId:'workflow-case',channel:'PHONE',outcome:'PROMISE_TO_PAY',notes:'Synthetic promise',promiseAmount:75,promiseDueAt:new Date(Date.now()+86400000).toISOString()})).success,true);
  assert.equal((await escalateRecoveryCaseAction({authToken:tokens[actor],taskId:'workflow-case',reason:'Synthetic escalation for QA'})).success,true);
  assert.equal((await addRecoveryLogAction({authToken:tokens[actor],taskId:'workflow-case',logText:'Wrong stage'})).success,false);
  assert.equal((await claimRecoveryCaseAction({authToken:tokens.legal,taskId:'workflow-case'})).success,true);
  const draft=await createDemandNoticeAction({authToken:tokens.legal,taskId:'workflow-case',responseDeadline:new Date(Date.now()+86400000).toISOString(),additionalTerms:'SYNTHETIC TEST ONLY — DO NOT SERVE'});assert.equal(draft.success,true);if(!draft.success||!draft.notice)throw Error(draft.message);
  assert.equal((await updateLegalCaseAction({authToken:tokens.legal,taskId:'workflow-case',nextStatus:'DEMAND_ISSUED',notes:'Bypass attempt'})).success,false);
  const issued=await Promise.all([issueDemandNoticeAction({authToken:tokens.legal,taskId:'workflow-case',noticeId:draft.notice.id,confirmedReviewed:true}),issueDemandNoticeAction({authToken:tokens.legal,taskId:'workflow-case',noticeId:draft.notice.id,confirmedReviewed:true})]);assert.equal(issued.filter(r=>r.success).length,1);
  assert.equal((await resolveLegalCaseAction({authToken:tokens.legal,taskId:'workflow-case',resolutionReason:'PAYMENT_COMPLETED',notes:'Synthetic paid claim'})).success,false);
  assert.equal((await resolveLegalCaseAction({authToken:tokens.legal2,taskId:'workflow-case',resolutionReason:'ADMINISTRATIVE_CLOSURE',notes:'Wrong officer'})).success,false);
  assert.equal((await resolveLegalCaseAction({authToken:tokens.legal,taskId:'workflow-case',resolutionReason:'SETTLEMENT_COMPLETED',notes:'Synthetic reviewed settlement; no external payment'})).success,true);
  assert.equal((await db.doc('recoveryTasks/workflow-case').get()).data()!.status,'RESOLVED');
});
test('cron skips no-code marketers but still reports missing owner policy as FAILED without inventing a code',async()=>{
  process.env.CRON_SECRET='synthetic-only-qa';const result=await cron(new NextRequest('http://127.0.0.1/api/cron',{method:'POST',headers:{authorization:'Bearer synthetic-only-qa'}}));assert.equal(result.status,500);const health=(await db.doc('automationHealth/daily').get()).data()!;assert.equal(health.status,'FAILED');assert.match(health.lastError,/Owner profit policy is not configured/);assert.equal(health.summary.marketerRating.errors,0);assert.equal(health.summary.marketerRating.skipped,1);assert.equal((await db.doc('users/marketer').get()).data()!.referralCode,undefined);
});


test('blank chat text is rejected without message or notification writes and valid text is preserved', async () => {
  const conversationId = 'workflow-blank-chat';
  const ref = db.collection('conversations').doc(conversationId);
  await ref.set({ participantIds: ['admin', 'client'], participantNames: ['Synthetic admin', 'Synthetic client'], readBy: [] });
  const notificationsBefore = (await db.collection('notifications').get()).size;
  for (const text of ['', '   ', '\n\t', '  \r\n  ']) {
    const result = await sendMessageAction({ authToken: tokens.client, conversationId, senderId: 'client', text });
    assert.equal(result.success, false);
    assert.equal((await ref.collection('messages').get()).size, 0);
    assert.equal((await db.collection('notifications').get()).size, notificationsBefore);
  }
  const text = '  Valid message content stays unchanged  ';
  assert.equal((await sendMessageAction({ authToken: tokens.client, conversationId, senderId: 'client', text })).success, true);
  const messages = await ref.collection('messages').get();
  assert.equal(messages.size, 1);
  assert.equal(messages.docs[0].data().text, text);
  assert.equal((await db.collection('notifications').get()).size, notificationsBefore + 1);
});


test('guarded administrator profile correction preserves access and writes audit history while denying unsupported fields and callers', async () => {
  const userRef = db.doc('users/client2'); const kycRef = db.doc('userKycProfiles/client2');
  const original = (await userRef.get()).data()!; const originalKyc = await kycRef.get();
  const input = { userId: 'client2', reason: 'Synthetic reviewed profile correction', name: 'Corrected Synthetic Client', revision: 0, status: 'SUBMITTED' };
  try {
    for (const actor of ['staff', 'owner', 'client']) {
      assert.equal((await getAdminUserRecordAction(tokens[actor], 'client2')).success, false);
      assert.equal((await saveAdminUserRecordAction(tokens[actor], input)).success, false);
    }
    assert.equal((await saveAdminUserRecordAction('', input)).success, false);
    assert.equal((await getAdminUserRecordAction(tokens.admin, 'client2')).success, true);
    const saved = await saveAdminUserRecordAction(tokens.admin, input); assert.equal(saved.success, true, JSON.stringify(saved));
    const profile = (await userRef.get()).data()!;
    for (const key of ['role', 'accessRole', 'personas']) assert.deepEqual(profile[key], original[key]);
    assert.equal(profile.name, input.name);
    const history = await kycRef.collection('history').get(); assert.equal(history.size, 1);
    assert.equal(history.docs[0].data().actorId, 'admin'); assert.equal(history.docs[0].data().reason, input.reason);
    assert.equal(history.docs[0].data().previousProfile.name, original.name);
    assert.equal((await saveAdminUserRecordAction(tokens.admin, { ...input, revision: 1, accessRole: 'ADMIN' })).success, false);
    assert.equal((await saveAdminUserRecordAction(tokens.admin, input)).success, false, 'Stale revisions remain rejected');
    assert.equal((await kycRef.collection('history').get()).size, 1);
    const selfInput = { authToken: tokens.client2, userId: 'client2', name: 'Synthetic self edit', phoneNumber: '', address: 'Synthetic valid address', bankName: '', bankAccountName: '', bankAccountNumber: '' };
    assert.equal((await updateProfileAction({ ...selfInput, authToken: tokens.client })).success, false);
    assert.equal((await updateProfileAction(selfInput)).success, true);
    assert.deepEqual((await userRef.get()).data()!.personas, original.personas);
  } finally {
    await userRef.set(original);
    await db.recursiveDelete(kycRef); if (originalKyc.exists) await kycRef.set(originalKyc.data()!);
  }
});

test('supported server role changes retain final owner, personas, claims and access-change audit', async () => {
  const auth = getAuth(getAdminApp()); const target = db.doc('users/client2'); const original = (await target.get()).data()!;
  const oldClaims = (await auth.getUser('client2')).customClaims || {};
  const audit = () => db.collection('transactions').where('type', '==', 'AccessRoleChange').get();
  const before = (await audit()).size;
  const change = (newAccessRole: 'STAFF' | 'USER', authToken = tokens.admin) => updateAccessRoleAction({ authToken, actorId: 'admin', targetUserId: 'client2', newAccessRole });
  try {
    assert.equal((await change('STAFF', tokens.staff)).success, false);
    assert.equal((await change('STAFF', tokens.client)).success, false);
    assert.equal((await updateAccessRoleAction({ authToken: tokens.admin, actorId: 'client', targetUserId: 'client2', newAccessRole: 'STAFF' })).success, false);
    assert.equal((await updateAccessRoleAction({ authToken: tokens.admin, actorId: 'admin', targetUserId: 'client2', newAccessRole: 'INVALID' as any })).success, false);
    const ownerBefore = (await db.doc('users/owner').get()).data();
    assert.equal((await db.collection('users').where('accessRole', '==', 'OWNER').get()).size, 1);
    const refusal = await updateAccessRoleAction({ authToken: tokens.admin, actorId: 'admin', targetUserId: 'owner', newAccessRole: 'USER' });
    assert.equal(refusal.success, false); assert.match(refusal.message, /last owner/);
    assert.deepEqual((await db.doc('users/owner').get()).data(), ownerBefore);
    assert.equal((await audit()).size, before);
    for (const role of ['STAFF', 'USER'] as const) {
      assert.equal((await change(role)).success, true);
      const profile = (await target.get()).data()!; const claims = (await auth.getUser('client2')).customClaims!;
      assert.equal(profile.accessRole, role); assert.deepEqual(profile.personas, original.personas);
      assert.equal(claims.accessRole, role); assert.deepEqual(claims.personas, original.personas);
      assert.equal(claims.primaryPortal, profile.primaryPortal);
    }
    const rows = (await audit()).docs; assert.equal(rows.length, before + 2);
    for (const row of rows.slice(before)) { assert.equal(row.data().userId, 'admin'); assert.equal(row.data().amount, 0); }
  } finally { await target.set(original); await auth.setCustomUserClaims('client2', oldClaims); }
});

test('existing role-change claims and audit partial-failure limitations remain explicit without weakening final-owner checks', async () => {
  const auth = getAuth(getAdminApp()); const target = db.doc('users/client2'); const original = (await target.get()).data()!;
  const oldClaims = (await auth.getUser('client2')).customClaims || {};
  const countAudit = async () => (await db.collection('transactions').where('type', '==', 'AccessRoleChange').get()).size;
  const before = await countAudit(); const originalClaimsMethod = auth.setCustomUserClaims;
  const collectionPrototype = Object.getPrototypeOf(db.collection('transactions')); const originalAdd = collectionPrototype.add;
  try {
    auth.setCustomUserClaims = async () => { throw new Error('Synthetic claims service failure'); };
    const claimsFailure = await updateAccessRoleAction({ authToken: tokens.admin, actorId: 'admin', targetUserId: 'client2', newAccessRole: 'STAFF' });
    assert.equal(claimsFailure.success, false);
    assert.equal((await target.get()).data()!.accessRole, 'STAFF', 'Existing transaction commits before claims update');
    assert.deepEqual((await auth.getUser('client2')).customClaims || {}, oldClaims);
    assert.equal(await countAudit(), before);
    auth.setCustomUserClaims = originalClaimsMethod; await target.set(original);
    collectionPrototype.add = function(data: unknown) { if (this.path === 'transactions') return Promise.reject(new Error('Synthetic audit write failure')); return originalAdd.call(this, data); };
    const auditFailure = await updateAccessRoleAction({ authToken: tokens.admin, actorId: 'admin', targetUserId: 'client2', newAccessRole: 'STAFF' });
    assert.equal(auditFailure.success, false);
    assert.equal((await target.get()).data()!.accessRole, 'STAFF');
    assert.equal((await auth.getUser('client2')).customClaims!.accessRole, 'STAFF');
    assert.equal(await countAudit(), before, 'Existing audit write remains separate from profile/claims');
    assert.equal((await db.doc('users/owner').get()).data()!.accessRole, 'OWNER');
  } finally {
    collectionPrototype.add = originalAdd; auth.setCustomUserClaims = originalClaimsMethod;
    await target.set(original); await auth.setCustomUserClaims('client2', oldClaims);
  }
});
