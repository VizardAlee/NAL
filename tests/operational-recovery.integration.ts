import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { adminDb as db, getAdminApp } from '../src/firebase/admin-app';
import { changeAccessRole } from '../src/lib/server/role-change';
import { executeDailyAutomation, type DailyJobs } from '../src/lib/server/daily-automation';
import { listFinancialDocumentsAction, findFinancialReceiptMatchesAction } from '../src/app/common/actions/financial-document-actions';

if (process.env.GCLOUD_PROJECT !== 'demo-nal-acceptance' || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true' || process.env.K_SERVICE || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(key => !/^127\.0\.0\.1:\d+$/.test(process.env[key] || ''))) throw Error('Loopback demo emulators only');
const auth = getAuth(getAdminApp()); const tokens: Record<string,string> = {};
const receiptId = 'f'.repeat(64); const bankId = 'f'.repeat(64);
const cleanup = ['roleChangeOperations','transactions','bankEntries','bankStatements','paymentReceipts','automationRuns','automationHealth'];
before(async () => {
  for (const collection of cleanup) await db.recursiveDelete(db.collection(collection));
  for (const [uid,accessRole,personas] of [['ops-admin','ADMIN',[]],['ops-customer','USER',['CLIENT']],['ops-other','USER',['CLIENT']],['ops-owner','OWNER',[]]] as const) {
    await auth.createUser({uid,email:`${uid}@nal.test`,password:'Emulator-only-123!'});
    await db.doc(`users/${uid}`).set({accessRole,personas,name:'Synthetic',role:accessRole === 'USER' ? 'Client' : 'Admin'});
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${uid}@nal.test`,password:'Emulator-only-123!',returnSecureToken:true})});
    tokens[uid] = (await response.json()).idToken;
  }
});
after(async () => {
  for (const collection of cleanup) await db.recursiveDelete(db.collection(collection));
  for (const uid of ['ops-admin','ops-customer','ops-other','ops-owner']) { await db.doc(`users/${uid}`).delete(); await auth.deleteUser(uid); }
  await getAdminApp().delete();
});

test('role audit creation failure rolls back profile, while settled claims failures recover exactly once', async () => {
  const proto = Object.getPrototypeOf(getFirestore(getAdminApp())); const original = proto.runTransaction;
  proto.runTransaction = function(callback: any,...args: any[]) { return original.call(this,async (tx:any) => {
    const create = tx.create.bind(tx); tx.create = (ref:any,data:any) => { if(data.type === 'AccessRoleChange') throw Error('Synthetic audit refusal'); return create(ref,data); };
    return callback(tx);
  },...args); };
  try { await assert.rejects(changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF'),/audit refusal/); }
  finally { proto.runTransaction = original; }
  assert.equal((await db.doc('users/ops-customer').get()).data()!.accessRole,'USER');
  assert.equal((await db.doc('roleChangeOperations/ops-customer').get()).exists,false);
  const setClaims = auth.setCustomUserClaims;
  await setClaims.call(auth,'ops-customer',{unrelated:'preserved'});
  auth.setCustomUserClaims = async () => { throw Object.assign(Error('Synthetic claims rejection'),{code:'auth/insufficient-permission'}); };
  try { assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,false); }
  finally { auth.setCustomUserClaims = setClaims; }
  const pending = (await db.doc('roleChangeOperations/ops-customer').get()).data()!;
  assert.equal(pending.status,'PENDING');
  const audit = db.doc(`transactions/accessRole_${pending.operationId}`);
  assert.equal((await audit.get()).exists,true);
  assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,true);
  assert.deepEqual((await auth.getUser('ops-customer')).customClaims,{unrelated:'preserved',role:'Admin',accessRole:'STAFF',personas:['CLIENT'],primaryPortal:'admin'});
  assert.equal((await db.collection('transactions').where('type','==','AccessRoleChange').get()).size,1);
  assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,true);
  assert.equal((await db.collection('transactions').where('type','==','AccessRoleChange').get()).size,1);
});

test('uncertain Auth responses block automatic retries, while confirmed completion-marker failures recover', async () => {
  const setClaims = auth.setCustomUserClaims;
  auth.setCustomUserClaims = async function(uid,claims) { await setClaims.call(this,uid,claims); throw Object.assign(Error('Synthetic lost claims response'),{code:'app/network-error'}); };
  try { assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,false); }
  finally {auth.setCustomUserClaims=setClaims;}
  assert.equal((await auth.getUser('ops-customer')).customClaims!.accessRole,'STAFF');
  const uncertain = db.doc('roleChangeOperations/ops-customer');
  assert.equal((await uncertain.get()).data()!.claimsOutcome,'UNCERTAIN');
  assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,false);
  assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','USER')).success,false);
  // Fixture-only review: this injected writer is known to have stopped. The
  // application deliberately exposes no automatic unlock operation.
  await uncertain.update({status:'PENDING',requiresReview:false});
  const before = (await db.collection('transactions').where('type','==','AccessRoleChange').get()).size;
  // Force only the post-Auth transaction to fail. Persisting PENDING afterwards
  // must allow a same-role retry, without repeating the profile or audit event.
  const realDb = getFirestore(getAdminApp()); const run = realDb.runTransaction; let calls = 0;
  realDb.runTransaction = function(...args:any[]) { calls++; if(calls === 2) return Promise.reject(Error('Synthetic completion marker failure')); return (run as any).apply(this,args); } as typeof run;
  try { assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,false); }
  finally {realDb.runTransaction=run;}
  assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,true);
  assert.equal((await db.collection('transactions').where('type','==','AccessRoleChange').get()).size,before);
});

test('remote Auth work can outlive a rejected promise and cannot be overtaken', async () => {
  const setClaims = auth.setCustomUserClaims;
  let release!:()=>void; const held = new Promise<void>(resolve=>{release=resolve;}); let remote!:Promise<void>;
  auth.setCustomUserClaims = function(uid,claims) {
    remote = held.then(()=>setClaims.call(this,uid,claims));
    return Promise.reject(Object.assign(Error('Synthetic timeout while remote write remains active'),{code:'app/network-timeout'}));
  };
  try {
    const result = await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF');
    assert.equal(result.success,false); assert.match(result.message,/uncertain/);
    assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','USER')).success,false);
    assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,false);
    assert.equal((await db.doc('users/ops-customer').get()).data()!.accessRole,'STAFF');
    release(); await remote;
    assert.equal((await db.doc('roleChangeOperations/ops-customer').get()).data()!.status,'WORKING');
    assert.equal((await db.doc('roleChangeOperations/ops-customer').get()).data()!.requiresReview,true);
  } finally {release(); if(remote) await remote; auth.setCustomUserClaims=setClaims;}
});

test('interrupted role writer is never taken over by age and unauthorized actors cannot recover it', async () => {
  await db.doc('roleChangeOperations/ops-customer').set({status:'WORKING',operationId:'interrupted',workerId:'paused',startedAt:Timestamp.fromMillis(0)});
  assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','USER')).success,false);
  await assert.rejects(changeAccessRole(db,auth,'ops-other','ops-customer','STAFF'),/Administrator/);
  assert.equal((await db.doc('users/ops-customer').get()).data()!.accessRole,'STAFF');
  await db.doc('roleChangeOperations/ops-customer').delete(); // Synthetic fixture cleanup only.
  await changeAccessRole(db,auth,'ops-admin','ops-customer','USER');
});

test('same-role synchronization preserves an existing valid portal preference and all personas', async () => {
  const ref = db.doc('users/ops-customer'); const previous = (await ref.get()).data()!;
  try {
    await ref.update({personas:['CLIENT','INVESTOR'],primaryPortal:'investor'});
    assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','USER')).success,true);
    const claims = (await auth.getUser('ops-customer')).customClaims!;
    assert.deepEqual(claims.personas,['CLIENT','INVESTOR']); assert.equal(claims.primaryPortal,'investor');
    assert.equal((await ref.get()).data()!.primaryPortal,'investor');
  } finally {await ref.set(previous);}
});

test('pending recovery refuses an out-of-band profile change before writing claims', async () => {
  const ref = db.doc('users/ops-customer'); const before = (await ref.get()).data()!;
  const setClaims = auth.setCustomUserClaims;
  auth.setCustomUserClaims = async () => { throw Object.assign(Error('Synthetic claims rejection'),{code:'auth/insufficient-permission'}); };
  try {assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,false);}
  finally {auth.setCustomUserClaims=setClaims;}
  const staged = (await ref.get()).data()!;
  await ref.set(before); // Competing writer is simulated only in the demo fixture.
  await assert.rejects(changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF'),/Profile changed/);
  assert.equal((await db.doc('roleChangeOperations/ops-customer').get()).data()!.status,'PENDING');
  await ref.set(staged); assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','STAFF')).success,true);
  assert.equal((await changeAccessRole(db,auth,'ops-admin','ops-customer','USER')).success,true);
});

test('receipt search, ownership and independent coverage traverse beyond all former caps', async () => {
  const batch = db.batch();
  const fields = {amount:10,paymentDate:'2026-10-19',reference:'TARGET-REF',sender:'',beneficiary:'',accountNumber:'0000000000',transferStatus:'SUCCESSFUL'};
  for (let i=0;i<230;i++) batch.set(db.doc(`paymentReceipts/${i.toString(16).padStart(64,'0')}`),{originalName:'Excluded',status:'DRAFT',uploadedBy:'ops-customer',customerId:i%2 ? 'ops-customer' : 'ops-other',fields:{...fields,reference:'EXCLUDED'},purpose:'REPAYMENT'});
  batch.set(db.doc(`paymentReceipts/${receiptId}`),{originalName:'Target evidence',status:'SUBMITTED',uploadedBy:'ops-customer',customerId:'ops-customer',fields,purpose:'REPAYMENT'});
  batch.set(db.doc(`paymentReceipts/${'e'.repeat(64)}`),{originalName:'Private other customer',status:'SUBMITTED',uploadedBy:'ops-other',customerId:'ops-other',fields:{...fields,reference:'PRIVATE'},purpose:'REPAYMENT'});
  await batch.commit();
  let bankBatch = db.batch();
  for(let i=0;i<450;i++) bankBatch.set(db.doc(`bankEntries/${i.toString(16).padStart(64,'0')}`),{date:'2026-10-19',amount:11,allocatedAmount:0,direction:'DEBIT',reference:'excluded',accountNumber:'0000000000'});
  bankBatch.set(db.doc(`bankEntries/${bankId}`),{date:'2026-10-19',amount:10,allocatedAmount:0,direction:'CREDIT',reference:'TARGET-REF',accountNumber:'0000000000',confirmed:true});
  await bankBatch.commit();
  const statements = db.batch();
  for(let i=0;i<225;i++) statements.set(db.doc(`bankStatements/${i.toString().padStart(4,'0')}`),{status:'REVIEWED',periodStart:'2026-01-01',periodEnd:'2026-01-02',accountNumber:'0000000000'});
  statements.set(db.doc('bankStatements/z-target'),{status:'REVIEWED',periodStart:'2026-10-01',periodEnd:'2026-10-31',accountNumber:'0000000000'}); await statements.commit();
  let cursor: string | undefined; const found = new Set<string>(); let pages = 0;
  do {
    const result = await listFinancialDocumentsAction(tokens['ops-customer'],undefined,{search:'Target',receiptCursor:cursor});
    if(!result.success) throw Error(result.message);
    assert.ok(result.data.pages.receipts.scanned <= 100); result.data.receipts.forEach((row:any)=>found.add(row.id));
    cursor = result.data.pages.receipts.nextCursor || undefined; pages++;
  } while(cursor);
  assert.equal(pages,3); assert.deepEqual([...found],[receiptId]);
  const malformed = await listFinancialDocumentsAction(tokens['ops-customer'],undefined,{receiptCursor:'invalid'}); assert.equal(malformed.success,false);
  const filtered = await listFinancialDocumentsAction(tokens['ops-admin'],undefined,{status:'SUBMITTED',search:'Target'});
  assert.equal(filtered.success,true); if(!filtered.success) throw Error(filtered.message); assert.equal(filtered.data.receipts.length,1);
  let request: any = {id:receiptId}; let covered = false; const matches = new Set(); let rounds = 0;
  do {
    const result = await findFinancialReceiptMatchesAction(tokens['ops-admin'],request); if(!result.success) throw Error(result.message);
    covered ||= result.data.covered; result.data.matches.forEach(row=>matches.add(row.id)); rounds++;
    request = {id:receiptId,...result.data}; delete request.matches; delete request.bankRows; delete request.covered;
  } while(!request.bankDone || !request.statementDone);
  assert.equal(rounds,3); assert.equal(covered,true); assert.deepEqual([...matches],[bankId]);
  const other = await findFinancialReceiptMatchesAction(tokens['ops-other'],{id:receiptId}); assert.equal(other.success,false);
  const first = await listFinancialDocumentsAction(tokens['ops-admin']); assert.ok(first.success);
  if(first.success) {
    assert.equal(first.data.statements.length,20); assert.equal(first.data.pages.statements.hasMore,true);
    assert.equal(first.data.bankRows.length,400); assert.equal(first.data.pages.bankRows.hasMore,true);
    const invalid = await listFinancialDocumentsAction(tokens['ops-customer'],undefined,{receiptCursor:first.data.pages.receipts.nextCursor!}); assert.equal(invalid.success,false);
  }
  assert.equal((await db.doc(`bankEntries/${bankId}`).get()).data()!.allocatedAmount,0);
});

const ok = async () => ({processed:1,errors:0,details:['Private diagnostic omitted']});
const jobs = (overrides: Partial<DailyJobs> = {}): DailyJobs => ({zakat:ok,recovery:ok,marketerRating:ok,ownerProfit:ok,whatsappReminders:ok,...overrides});
test('daily reporting retains settled sibling outcomes and preserves financial failure gates', async () => {
  let ownerCalls = 0, whatsappCalls = 0;
  const result = await executeDailyAutomation(db,jobs({zakat:async()=>{throw Error('Synthetic Zakat failure');},recovery:async()=>{await new Promise(resolve=>setTimeout(resolve,50));return {tasksUpdated:10,errors:0};},ownerProfit:async()=>{ownerCalls++;return {};},whatsappReminders:async()=>{whatsappCalls++;return {};}}));
  assert.equal(result.success,false); assert.equal(ownerCalls,0); assert.equal(whatsappCalls,0);
  const run = (await db.doc(`automationRuns/${result.runId}`).get()).data()!;
  assert.equal(run.components.recovery.status,'SUCCEEDED'); assert.equal(run.summary.recovery.tasksUpdated,10);
  assert.equal(run.components.ownerProfit.status,'NOT_STARTED'); assert.equal(run.components.zakat.status,'FAILED');
  const policyFailure = await executeDailyAutomation(db,jobs({ownerProfit:async()=>{throw Error('Owner profit policy is not configured. Allocation has been stopped.');},whatsappReminders:async()=>{whatsappCalls++;return {};}}));
  assert.equal(policyFailure.success,false); assert.equal(policyFailure.components.whatsappReminders.status,'NOT_STARTED'); assert.equal(whatsappCalls,0);
  assert.equal(policyFailure.summary.zakat.details,undefined);
  const counted = await executeDailyAutomation(db,jobs({ownerProfit:async()=>({errors:1,allocated:0})}));
  assert.equal(counted.success,false); assert.equal(counted.components.ownerProfit.status,'FAILED');
});

test('older daily completion cannot overwrite a newer run and reporting failure never repeats business work', async () => {
  let release!:()=>void; let entered!:()=>void; const hold = new Promise<void>(resolve=>{release=resolve;}); const started = new Promise<void>(resolve=>{entered=resolve;});
  const older = executeDailyAutomation(db,jobs({recovery:async()=>{entered();await hold;return {errors:0};}})); await started;
  const newer = await executeDailyAutomation(db,jobs()); release(); const old = await older;
  const health = (await db.doc('automationHealth/daily').get()).data()!;
  assert.equal(health.lastRunId,newer.runId); assert.equal(health.status,'HEALTHY');
  assert.equal((await db.doc(`automationRuns/${old.runId}`).get()).data()!.status,'SUCCEEDED');
  const proto = Object.getPrototypeOf(db.doc('automationRuns/x')); const update = proto.update; let failed = false; let calls = 0;
  proto.update = function(...args:any[]) { if(this.parent.id === 'automationRuns' && !failed) {failed=true;return Promise.reject(Error('Synthetic reporting failure'));} return update.apply(this,args); };
  try {
    const result = await executeDailyAutomation(db,jobs({ownerProfit:async()=>{calls++;return {errors:0};}}));
    assert.equal(result.success,false); assert.equal(calls,1); assert.equal(result.components.ownerProfit.status,'SUCCEEDED');
    assert.equal((await db.doc(`automationRuns/${result.runId}`).get()).data()!.reportingErrors.length,1);
  } finally {proto.update=update;}
});
