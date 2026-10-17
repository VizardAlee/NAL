import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import { adminDb as db, getAdminApp } from '../src/firebase/admin-app';
import { getMarketerStats } from '../src/app/marketer/dashboard/actions';
import { signUpWithEmailAction } from '../src/app/signup/actions';
import { POST as cron } from '../src/app/api/cron/route';
import { createRequire } from 'node:module';

if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== 'demo-nal-acceptance' || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(key => !/^127\.0\.0\.1:\d+$/.test(process.env[key] || ''))) throw new Error('Disposable loopback emulators only.');

test('paused signup, historical reporting, roles, and daily component outcomes remain coherent', async () => {
  const ids = ['legacy','admin','history','client','investor'].map(s => `referral-qa-${s}`);
  const [legacy, admin, history, client, investor] = ids;
  const auth = getAuth(getAdminApp());
  const written: string[] = [];
  const originalHealth = (await db.doc('automationHealth/daily').get()).data();
  const oldPolicy = (await db.doc('platformPolicies/ownerProfit').get()).data();
  const oldNotifications = new Set((await db.collection('notifications').get()).docs.map(d => d.id));
  const oldRuns = new Set((await db.collection('automationRuns').get()).docs.map(d => d.id));
  const oldTransactions = (await db.collection('transactions').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const oldUsers = new Set((await db.collection('users').get()).docs.map(d => d.id));
  const functionAdmin = createRequire(import.meta.url)(createRequire(import.meta.url).resolve('firebase-admin', { paths: [process.cwd() + '/functions'] }));
  functionAdmin.initializeApp({ projectId: 'demo-nal-acceptance' });
  const put = async (path: string, data: FirebaseFirestore.DocumentData) => { written.push(path); await db.doc(path).set(data); };
  try {
    for (const id of ids) await auth.createUser({ uid: id, email: `${id}@nal.test`, password: 'Emulator-only-123!' });
    await put(`users/${legacy}`, { name: 'Legacy marketer', role: 'Marketer', rating: 4.2 });
    await put(`users/${admin}`, { name: 'Admin marketer', role: 'Admin', accessRole: 'ADMIN', personas: ['MARKETER'], primaryPortal: 'admin', rating: 4.7 });
    await put(`users/${history}`, { name: 'Historical marketer', role: 'Marketer', referralCode: 'MARK-HIST-TEST', rating: 2 });
    await put(`users/${client}`, { name: 'Historical client', role: 'Client', referredByCode: 'MARK-HIST-TEST' });
    await put(`users/${investor}`, { name: 'Historical investor', role: 'Investor', referredByCode: 'MARK-HIST-TEST' });
    await put('fundBatches/referral-qa-fund', { sourceId: investor, amount: 250 });
    await put('deals/referral-qa-manual', { marketerId: admin, clientId: client, principal: 125, dealName: 'Manual', clientName: 'Historical client', status: 'Draft' });
    await put('deals/referral-qa-historical', { clientId: client, principal: 300, dealName: 'Historical', clientName: 'Historical client', status: 'Completed' });
    await put('repayments/referral-qa-payment', { dealId: 'referral-qa-historical', status: 'Approved', amount: 10, dueDate: Timestamp.fromDate(new Date('2026-01-02')), lodgedAt: Timestamp.fromDate(new Date('2026-01-01')) });
    const signIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${admin}@nal.test`, password: 'Emulator-only-123!', returnSecureToken: true }) });
    const token = (await signIn.json()).idToken;
    const stats = await getMarketerStats({ authToken: token, marketerId: admin });
    assert.equal(stats.success, true);
    assert.equal(stats.data!.referredClientCount, null);
    assert.equal(stats.data!.referredInvestorCount, null);
    assert.equal(stats.data!.totalInvestorCapital, null);
    assert.equal(stats.data!.referredClients, null);
    assert.equal(stats.data!.totalDealValue, 125);
    const historical = await getMarketerStats({ authToken: token, marketerId: history });
    assert.equal(historical.success, true);
    assert.equal(historical.data!.referredClientCount, 1);
    assert.equal(historical.data!.referredInvestorCount, 1);
    assert.equal(historical.data!.totalInvestorCapital, 250);
    assert.equal(historical.data!.totalDealValue, 425);
    const legacySignIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${legacy}@nal.test`, password: 'Emulator-only-123!', returnSecureToken: true }) });
    const legacyToken = (await legacySignIn.json()).idToken;
    const selfStats = await getMarketerStats({ authToken: legacyToken, marketerId: legacy });
    assert.equal(selfStats.success, true);
    assert.equal(selfStats.data!.referredClientCount, null);
    assert.equal((await getMarketerStats({ authToken: legacyToken, marketerId: history })).success, false);
    const denied = await getMarketerStats({ authToken: '', marketerId: admin });
    assert.equal(denied.success, false);
    // A stale signup client cannot inject attribution, and neither role form
    // generates a new code/rating. Existing profile claims retain old fields.
    for (const [key, accessRole, personas] of [['legacy', 'USER', ['MARKETER']], ['mixed', 'ADMIN', ['MARKETER']]] as const) {
      const invite = `referral-qa-invite-${key}-long-token`;
      const email = `referral-qa-signup-${key}@nal.test`;
      await put(`invites/${invite}`, { email, status: 'Pending', role: key === 'legacy' ? 'Marketer' : 'Admin', accessRole, personas, primaryPortal: key === 'legacy' ? 'marketer' : 'admin', accountType: 'Individual' });
      const result = await signUpWithEmailAction({ name: 'Synthetic Marketer', email, password: 'Emulator-only-123!', accountType: 'Individual', inviteToken: invite, referralCode: 'MARK-HIST-TEST' } as any);
      assert.equal(result.success, true, result.message);
      const user = await auth.getUserByEmail(email);
      const profile = (await db.doc(`users/${user.uid}`).get()).data()!;
      assert.equal(profile.referralCode, undefined);
      assert.equal(profile.referredByCode, undefined);
      assert.equal(profile.rating, undefined);
      assert.equal(profile.accessRole, accessRole);
      assert.deepEqual(profile.personas, personas);
    }
    await db.doc(`users/${history}`).update({ accountClaimStatus: 'UNCLAIMED' });
    await put('invites/referral-qa-claim-long-token', { email: `${history}@nal.test`, status: 'Pending', role: 'Marketer', accessRole: 'USER', personas: ['MARKETER'], primaryPortal: 'marketer', accountType: 'Individual', existingProfileId: history });
    const claimed = await signUpWithEmailAction({ name: 'Historical marketer', email: `${history}@nal.test`, password: 'Emulator-only-123!', accountType: 'Individual', inviteToken: 'referral-qa-claim-long-token', referralCode: 'ignored-new-code' } as any);
    assert.equal(claimed.success, true, claimed.message);
    assert.equal((await db.doc(`users/${history}`).get()).data()!.referralCode, 'MARK-HIST-TEST');
    assert.equal((await db.doc(`users/${history}`).get()).data()!.rating, 2);
    const { createUser } = await import('../functions/src/users');
    const created = await createUser.run({ data: { name: 'Callable marketer', email: 'referral-qa-callable@nal.test', password: 'Emulator-only-123!', role: 'Marketer', referralCode: 'MARK-HIST-TEST' }, auth: { uid: admin }, rawRequest: { headers: { authorization: `Bearer ${token}` } } } as any);
    assert.equal(created.success, true);
    const callableProfile = (await db.doc(`users/${created.uid}`).get()).data()!;
    assert.equal(callableProfile.referralCode, undefined);
    assert.equal(callableProfile.referredByCode, undefined);
    assert.equal(callableProfile.rating, undefined);
    // Valid, synthetic owner setup lets us assert the complete daily path.
    await db.doc('platformPolicies/ownerProfit').set({ retainedPercent: 50, distributablePercent: 50, totalShares: 1 });
    await put('ownershipPartners/referral-qa-owner', { userId: admin, active: true, shareUnits: 1, displayName: 'Synthetic' });
    process.env.CRON_SECRET = 'synthetic-only-qa';
    const invoke = () => cron(new NextRequest('http://127.0.0.1/api/cron', { method: 'POST', headers: { authorization: 'Bearer synthetic-only-qa' } }));
    const response = await invoke();
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.marketerRating.errors, 0);
    assert.ok(body.marketerRating.skipped >= 5);
    assert.equal(body.marketerRating.processed, 1);
    assert.equal((await db.doc('automationHealth/daily').get()).data()!.status, 'HEALTHY');
    assert.equal((await db.doc(`users/${legacy}`).get()).data()!.rating, 4.2);
    assert.equal((await db.doc(`users/${admin}`).get()).data()!.rating, 4.7);
    assert.equal((await db.doc(`users/${history}`).get()).data()!.rating, 5);
    assert.equal((await db.doc(`users/${history}`).get()).data()!.referralCode, 'MARK-HIST-TEST');
    assert.equal((await db.doc(`users/${client}`).get()).data()!.referredByCode, 'MARK-HIST-TEST');
    assert.deepEqual((await db.doc(`users/${admin}`).get()).data()!.personas, ['MARKETER']);
    assert.deepEqual((await db.collection('transactions').get()).docs.map(d => ({ id: d.id, ...d.data() })), oldTransactions);
    // Missing owner setup remains an actual failure; the pause must not mask it.
    await db.doc('platformPolicies/ownerProfit').delete();
    const missingOwner = await invoke();
    assert.equal(missingOwner.status, 500);
    assert.match((await missingOwner.json()).error, /Owner profit policy is not configured/);
    // Historical rating errors still fail health rather than becoming a skip.
    await db.doc('repayments/referral-qa-payment').update({ dueDate: 'malformed' });
    const badHistory = await invoke();
    assert.equal(badHistory.status, 500);
    assert.match((await badHistory.json()).error, /marketerRating/);
  } finally {
    for (const path of written.reverse()) await db.doc(path).delete();
    for (const doc of (await db.collection('users').get()).docs) if (!oldUsers.has(doc.id)) { await auth.deleteUser(doc.id).catch(() => {}); await doc.ref.delete(); }
    for (const doc of (await db.collection('notifications').get()).docs) if (!oldNotifications.has(doc.id)) await doc.ref.delete();
    for (const doc of (await db.collection('automationRuns').get()).docs) if (!oldRuns.has(doc.id)) await doc.ref.delete();
    if (oldPolicy) await db.doc('platformPolicies/ownerProfit').set(oldPolicy); else await db.doc('platformPolicies/ownerProfit').delete();
    if (originalHealth) await db.doc('automationHealth/daily').set(originalHealth); else await db.doc('automationHealth/daily').delete();
    for (const id of ids) await auth.deleteUser(id).catch(() => {});
    await functionAdmin.app().delete();
    await getAdminApp().delete();
  }
});
