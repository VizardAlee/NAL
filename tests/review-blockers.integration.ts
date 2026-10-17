import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { adminDb as db, getAdminApp } from '../src/firebase/admin-app';
import { processRepaymentRequestAction, processReinvestmentRequestAction, processWithdrawalRequestAction } from '../src/app/admin/approvals/actions';
import { requestRepaymentPlanChangeAction, processRepaymentPlanChangeAction } from '../src/app/repayment-plan-actions';
import { requestWithdrawalAction, requestCapitalWithdrawalAction, reinvestAction } from '../src/app/investor/dashboard/withdrawal-actions';
import { sendMessageAction } from '../src/app/common/actions/chat-actions';
import { generateAmortizationSchedule, calculateRemainingRepaymentBalance } from '../src/lib/amortization';
import { calculateAvailableProfit, calculateInvestorPortfolioValue, roundCurrency } from '../src/lib/financial-integrity';

if (process.env.GCLOUD_PROJECT !== 'demo-nal-acceptance' || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true' || process.env.K_SERVICE || ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'].some(k => !/^127\.0\.0\.1:\d+$/.test(process.env[k] || ''))) throw Error('Isolated loopback demo regressions only');
const uid = (s: string) => 'blocker-' + s;
const ago = (days: number) => Timestamp.fromMillis(Date.now() - days * 86400000);
const tokens: Record<string, string> = {};
let rules: Awaited<ReturnType<typeof initializeTestEnvironment>>;
const ledger = async (s: string) => (await db.collection('transactions').where('userId', '==', uid(s)).get()).docs.map(d => d.data());
const principalCash = async (s: string) => roundCurrency((await db.collection('fundBatches').where('sourceId', '==', uid(s)).get()).docs.reduce((n, d) => n + d.data().remainingAmount, 0));
const decision = (requestId: string, kind: 'Approved' | 'Rejected' = 'Approved') => ({ authToken: tokens.admin, requestId, decision: kind });
const withdrawal = (s: string, amount: number) => { const f = new FormData(); for (const [k, v] of Object.entries({ authToken: tokens[s], userId: uid(s), userName: 'Synthetic', amount: String(amount), source: 'ShortTermProfit' })) f.set(k, v); return requestWithdrawalAction({}, f); };
async function seedProfit(s: string, days = 100, tenure = 90, amount = 40) {
  await db.doc('fundBatches/' + uid(s)).set({ sourceId: uid(s), amount: 100, remainingAmount: 100, createdAt: ago(days), paymentDate: ago(days), tenureValue: tenure, tenureUnit: 'Days' });
  await db.doc('transactions/' + uid(s)).set({ userId: uid(s), type: 'ProfitDistribution', amount, fundBatchId: uid(s), createdAt: ago(10), profitEarnedAt: ago(10) });
}
async function postedState(id: string) {
  const [request, tx, batches] = await Promise.all([db.doc('reinvestmentRequests/' + id).get(), db.collection('transactions').get(), db.collection('fundBatches').get()]);
  return JSON.stringify({ request: request.data(), transactions: tx.docs.map(d => [d.id, d.data()]).sort(), batches: batches.docs.map(d => [d.id, d.data()]).sort() });
}
async function repaymentState(id: string) {
  const [request, tx, batches] = await Promise.all([db.doc('repayments/' + id).get(), db.collection('transactions').get(), db.collection('fundBatches').get()]);
  return JSON.stringify({ request: request.data(), transactions: tx.docs.map(d => [d.id, d.data()]).sort(), batches: batches.docs.map(d => [d.id, d.data()]).sort() });
}
async function seedDeal(s: string, principal = 300, duration = 90, age = 45, investor = 'lifecycle') {
  const id = uid(s);
  await db.doc('fundBatches/' + id).set({ sourceId: uid(investor), amount: principal, remainingAmount: 0, createdAt: ago(100), paymentDate: ago(100), principalLockedUntil: ago(1), tenureValue: 90, tenureUnit: 'Days' });
  await db.doc('deals/' + id).set({ clientId: uid('client'), clientName: 'Synthetic Client', dealName: 'Synthetic ' + s, status: 'Active', principal, profitRate: 10, durationValue: duration, durationUnit: 'Days', repaymentFrequency: 'Monthly', startDate: ago(age), createdAt: ago(age) });
  await db.doc('investments/' + id).set({ investorId: uid(investor), dealId: id, fundBatchId: id, amount: principal });
  return id;
}
async function pendingRepayment(id: string, dealId: string, amount: number, installmentNumber = 1) {
  await db.doc('repayments/' + id).set({ dealId, clientId: uid('client'), amount, installmentNumber, status: 'Pending', lodgedAt: Timestamp.now() });
}
async function restructure(dealId: string, frequency: 'Weekly' | 'Fortnightly') {
  const submit = await requestRepaymentPlanChangeAction({ authToken: tokens.client, clientId: uid('client'), dealId, repaymentFrequency: frequency, reason: 'Synthetic approved frequency adjustment' });
  assert.equal(submit.success, true, submit.message);
  const before = (await db.doc('deals/' + dealId).get()).data()!;
  await processRepaymentPlanChangeAction({ authToken: tokens.admin, requestId: before.pendingRepaymentPlanChangeRequestId, decision: 'Approved' });
  return (await db.doc('deals/' + dealId).get()).data()!;
}
before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  rules = await initializeTestEnvironment({ projectId: 'demo-nal-acceptance', firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
  for (const key of ['admin', 'client', 'invalid', 'locked', 'lifecycle', 'race', 'reserved', 'removed', 'redeem', 'unlinked']) {
    await getAuth(getAdminApp()).createUser({ uid: uid(key), email: uid(key) + '@nal.test', password: 'Emulator-only-123!' });
    await db.doc('users/' + uid(key)).set({ name: 'Synthetic ' + key, accessRole: key === 'admin' ? 'ADMIN' : 'USER', role: key === 'admin' ? 'Admin' : key === 'client' ? 'Client' : 'Investor', personas: key === 'admin' ? [] : [key === 'client' ? 'CLIENT' : 'INVESTOR'], primaryPortal: key === 'admin' ? 'admin' : key === 'client' ? 'client' : 'investor', isMuslim: false });
    const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: uid(key) + '@nal.test', password: 'Emulator-only-123!', returnSecureToken: true }) });
    tokens[key] = (await r.json()).idToken; assert.ok(tokens[key]);
  }
  // This suite isolates repayment conservation from separately tested owner allocation.
  await db.doc('platformPolicies/ownerProfit').delete();
});
after(async () => { await rules?.cleanup(); await getAdminApp().delete(); });

test('F1: prepayment allocations survive restructuring and concurrent approval cannot overcollect the contract', async () => {
  const dealId = await seedDeal('prepayment'); const firstId = uid('first-payment');
  await pendingRepayment(firstId, dealId, 220); await processRepaymentRequestAction(decision(firstId));
  const first = (await db.doc('repayments/' + firstId).get()).data()!;
  assert.deepEqual(first.allocations.map((a: any) => a.installmentNumber), [1, 2]);
  const original = generateAmortizationSchedule((await db.doc('deals/' + dealId).get()).data() as any);
  const revised = await restructure(dealId, 'Weekly');
  assert.deepEqual(revised.repaymentPlanOverride.preservedInstallments.map((r: any) => r.installment), [1, 2]);
  assert.equal(generateAmortizationSchedule(revised as any).at(-1)!.dueDate.toISOString(), original.at(-1)!.dueDate.toISOString());
  assert.equal(calculateRemainingRepaymentBalance(revised as any, [first]).totalRemaining, 110);
  const start = revised.repaymentPlanOverride.futureSegment.startingInstallment;
  const excessive = uid('excessive'); await pendingRepayment(excessive, dealId, 220, start);
  const before = await repaymentState(excessive);
  await assert.rejects(processRepaymentRequestAction(decision(excessive)), /remaining.*balance|outstanding/i);
  assert.equal(await repaymentState(excessive), before, 'Rejected approval must make zero writes');
  await processRepaymentRequestAction(decision(excessive, 'Rejected'));
  const ids = [uid('final-a'), uid('final-b')]; for (const id of ids) await pendingRepayment(id, dealId, 110, start);
  const results = await Promise.allSettled(ids.map(id => processRepaymentRequestAction(decision(id))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rows = (await db.collection('repayments').where('dealId', '==', dealId).get()).docs.map(d => d.data());
  const paid = rows.filter(r => r.status === 'Approved');
  assert.equal(roundCurrency(paid.reduce((n, r) => n + r.amount, 0)), 330);
  assert.equal(roundCurrency(paid.reduce((n, r) => n + r.principalApplied, 0)), 300);
  assert.equal(roundCurrency(paid.reduce((n, r) => n + r.interestApplied, 0)), 30);
  assert.equal(calculateRemainingRepaymentBalance(revised as any, paid).totalRemaining, 0);
  const loser = rows.find(r => r.status === 'Pending')!; assert.ok(loser);
  for (const [i, id] of ids.entries()) if (results[i].status === 'rejected') assert.equal((await db.collection('transactions').where('sourceRequestId', '==', id).get()).size, 0);
});

test('F1: partial credits remain attached through repeated frequency changes', async () => {
  const dealId = await seedDeal('partial'); const firstId = uid('partial-first');
  await pendingRepayment(firstId, dealId, 55); await processRepaymentRequestAction(decision(firstId));
  const original = (await db.doc('repayments/' + firstId).get()).data()!;
  await restructure(dealId, 'Weekly'); const revised = await restructure(dealId, 'Fortnightly');
  assert.deepEqual((await db.doc('repayments/' + firstId).get()).data(), original);
  assert.equal(calculateRemainingRepaymentBalance(revised as any, [original]).totalRemaining, 275);
  const finalId = uid('partial-final'); await pendingRepayment(finalId, dealId, 275, 1);
  await processRepaymentRequestAction(decision(finalId));
  const final = (await db.doc('repayments/' + finalId).get()).data()!;
  assert.equal(original.principalApplied + final.principalApplied, 300);
  assert.equal(original.interestApplied + final.interestApplied, 30);
});

test('F1: a repayment racing a frequency approval is preserved once or blocks the change without partial writes', async () => {
  const dealId = await seedDeal('frequency-race');
  assert.equal((await requestRepaymentPlanChangeAction({ authToken: tokens.client, clientId: uid('client'), dealId, repaymentFrequency: 'Weekly', reason: 'Synthetic concurrent frequency adjustment' })).success, true);
  const requestId = (await db.doc('deals/' + dealId).get()).data()!.pendingRepaymentPlanChangeRequestId;
  const id = uid('frequency-race-pay'); await pendingRepayment(id, dealId, 220);
  const result = await Promise.allSettled([processRepaymentRequestAction(decision(id)), processRepaymentPlanChangeAction({ authToken: tokens.admin, requestId, decision: 'Approved' })]);
  assert.equal(result[0].status, 'fulfilled');
  if (result[1].status === 'rejected') {
    assert.equal((await db.doc('repaymentPlanChangeRequests/' + requestId).get()).data()!.status, 'Pending');
    assert.equal((await db.doc('deals/' + dealId).get()).data()!.repaymentPlanOverride, undefined);
    await processRepaymentPlanChangeAction({ authToken: tokens.admin, requestId, decision: 'Approved' });
  }
  const revised = (await db.doc('deals/' + dealId).get()).data()!;
  assert.deepEqual(revised.repaymentPlanOverride.preservedInstallments.map((r: any) => r.installment), [1, 2]);
  assert.equal(calculateRemainingRepaymentBalance(revised as any, [(await db.doc('repayments/' + id).get()).data()!]).totalRemaining, 110);
  assert.equal((await db.collection('transactions').where('sourceRequestId', '==', id).where('type', '==', 'Repayment').get()).size, 1);
});

test('F2: real client SDK rules deny reinvestment creation and updates, including admin', async () => {
  for (const key of ['invalid', 'admin']) {
    const browserDb = rules.authenticatedContext(uid(key)).firestore();
    for (const amount of [-100, 20]) await assertFails(setDoc(doc(browserDb, 'reinvestmentRequests', uid('forged-' + key + amount)), { investorId: uid(key), investorName: 'Synthetic', amount, status: 'Pending' }));
    await db.doc('reinvestmentRequests/' + uid('frozen-' + key)).set({ investorId: uid(key), amount: 1, status: 'Pending' });
    await assertFails(updateDoc(doc(browserDb, 'reinvestmentRequests', uid('frozen-' + key)), { status: 'Approved', amount: -100 }));
  }
});

test('F4: direct message writes are denied and real server actions retain valid text and attachments', async () => {
  await db.doc('conversations/' + uid('chat')).set({ participantIds: [uid('client'), uid('admin')] });
  const browserDb = rules.authenticatedContext(uid('client')).firestore();
  for (const [i, text] of ['', ' ', '\n\t ', '\u00a0', 'valid content'].entries()) await assertFails(setDoc(doc(browserDb, 'conversations', uid('chat'), 'messages', String(i)), { senderId: uid('client'), text }));
  const base = { authToken: tokens.client, senderId: uid('client'), conversationId: uid('chat') };
  for (const text of ['', ' \n\t', '\u00a0']) assert.equal((await sendMessageAction({ ...base, text })).success, false);
  assert.equal((await sendMessageAction({ ...base, text: 'Synthetic valid message' })).success, true);
  assert.equal((await sendMessageAction({ ...base, text: ' ', attachmentUrl: 'https://firebasestorage.googleapis.com/synthetic-only', attachmentName: 'synthetic.pdf' })).success, true);
  assert.equal((await db.collection('conversations/' + uid('chat') + '/messages').get()).size, 2);
});

test('F2: approval refuses invalid stored amounts and stale locked profit with zero writes', async () => {
  await seedProfit('invalid'); await seedProfit('locked', 50, 365, 25);
  for (const [i, amount] of [-100, 0, 0.001, 0.000000001, 40.01, NaN, Infinity, '10', Number.MAX_SAFE_INTEGER].entries()) {
    const id = uid('invalid-' + i); await db.doc('reinvestmentRequests/' + id).set({ investorId: uid('invalid'), amount, status: 'Pending' });
    const before = await postedState(id); await assert.rejects(processReinvestmentRequestAction(decision(id)));
    assert.equal(await postedState(id), before, 'Invalid approval must make zero writes');
    await processReinvestmentRequestAction(decision(id, 'Rejected'));
    assert.equal((await db.collection('transactions').where('sourceRequestId', '==', id).get()).size, 0);
  }
});

test('F2: approval independently rejects locked profit in a pre-existing request with zero writes', async () => {
  assert.equal((await reinvestAction({ authToken: tokens.locked, userId: uid('locked'), userName: 'Synthetic', amount: 20 })).success, false);
  const id = uid('locked-legacy'); await db.doc('reinvestmentRequests/' + id).set({ investorId: uid('locked'), amount: 20, status: 'Pending' });
  const before = await postedState(id); await assert.rejects(processReinvestmentRequestAction(decision(id)), /profit|maturity/i); assert.equal(await postedState(id), before);
});

test('F2: unlinked legacy profit cannot bypass maturity evidence at request or approval', async () => {
  await db.doc('transactions/' + uid('unlinked-profit')).set({ userId: uid('unlinked'), type: 'ProfitDistribution', amount: 25, createdAt: ago(10) });
  assert.equal((await reinvestAction({ authToken: tokens.unlinked, userId: uid('unlinked'), userName: 'Synthetic', amount: 20 })).success, false);
  assert.equal((await withdrawal('unlinked', 20)).success, false);
  const id = uid('unlinked-legacy'); await db.doc('reinvestmentRequests/' + id).set({ investorId: uid('unlinked'), amount: 20, status: 'Pending' });
  const before = await postedState(id); await assert.rejects(processReinvestmentRequestAction(decision(id)), /profit|mature/i); assert.equal(await postedState(id), before);
});

test('F2/F3: withdrawal and reinvestment reserve one profit pool; approval rechecks reservations and persona', async () => {
  await seedProfit('race');
  const results = await Promise.all([withdrawal('race', 30), reinvestAction({ authToken: tokens.race, userId: uid('race'), userName: 'Synthetic', amount: 30 })]);
  assert.equal(results.filter(r => r.success).length, 1);
  await seedProfit('reserved');
  const id = uid('reserved-reinvest'); await db.doc('reinvestmentRequests/' + id).set({ investorId: uid('reserved'), amount: 30, status: 'Pending' });
  await db.doc('withdrawalRequests/' + uid('reserved-withdraw')).set({ investorId: uid('reserved'), amount: 20, source: 'ShortTermProfit', status: 'Pending', type: 'InvestorWithdrawal' });
  const before = await postedState(id); await assert.rejects(processReinvestmentRequestAction(decision(id)), /profit/i); assert.equal(await postedState(id), before);
  await seedProfit('removed'); const removed = uid('removed-reinvest');
  await db.doc('reinvestmentRequests/' + removed).set({ investorId: uid('removed'), amount: 10, status: 'Pending' }); await db.doc('users/' + uid('removed')).update({ personas: [] });
  const old = await postedState(removed); await assert.rejects(processReinvestmentRequestAction(decision(removed)), /investor|access|persona/i); assert.equal(await postedState(removed), old);
});

test('F3: repayment, profit withdrawal and full capital redemption conserve cash and leave no stranded principal', async () => {
  const dealId = await seedDeal('lifecycle-deal', 100, 90, 100, 'redeem');
  await db.doc('transactions/' + uid('lifecycle-deposit')).set({ userId: uid('redeem'), type: 'Deposit', amount: 100, createdAt: ago(100) });
  const pay = uid('lifecycle-pay'); await pendingRepayment(pay, dealId, 110); await processRepaymentRequestAction(decision(pay));
  assert.equal((await db.doc('fundBatches/' + dealId).get()).data()!.remainingAmount, 100);
  const profitBefore = calculateAvailableProfit(await ledger('redeem'));
  const result = await withdrawal('redeem', 4); assert.equal(result.success, true, result.message);
  const request = (await db.collection('withdrawalRequests').where('investorId', '==', uid('redeem')).where('status', '==', 'Pending').get()).docs[0];
  const approvals = await Promise.allSettled([processWithdrawalRequestAction(decision(request.id)), processWithdrawalRequestAction(decision(request.id))]); assert.equal(approvals.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.doc('fundBatches/' + dealId).get()).data()!.remainingAmount, 100, 'Profit withdrawal must not consume principal');
  assert.equal(calculateAvailableProfit(await ledger('redeem')), roundCurrency(profitBefore - 4));
  const input = { authToken: tokens.redeem, userId: uid('redeem'), userName: 'Synthetic', batchId: dealId };
  const capital = await Promise.all([requestCapitalWithdrawalAction(input), requestCapitalWithdrawalAction(input)]); assert.ok(capital.every(r => r.success), JSON.stringify(capital));
  const capitalRequest = (await db.collection('withdrawalRequests').where('investorId', '==', uid('redeem')).where('source', '==', 'Capital').get()).docs.find(d => d.data().fundBatchId === dealId)!; assert.ok(capitalRequest);
  await processWithdrawalRequestAction(decision(capitalRequest.id));
  assert.equal((await db.doc('fundBatches/' + dealId).get()).data()!.remainingAmount, 0);
  assert.equal(calculateAvailableProfit(await ledger('redeem')), 0);
  assert.equal(calculateInvestorPortfolioValue(await ledger('redeem')), 0);
  assert.equal(await principalCash('redeem'), 0);
  const related = (await db.collection('transactions').where('sourceRequestId', '==', pay).get()).docs.map(d => d.data());
  assert.equal(related.find(t => t.type === 'ProfitDistribution')!.amount, 4);
  assert.equal(related.find(t => t.type === 'PlatformEarning')!.amount, 6);
  assert.equal(100 + 4 + 6, 110);
  assert.equal((await db.collection('transactions').where('sourceRequestId', '==', capitalRequest.id).get()).docs[0].data().amount, -100);
});
