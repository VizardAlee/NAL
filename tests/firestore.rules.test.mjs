import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nal',
    firestore: { rules: await fs.readFile('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8088 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'admin'), { role: 'Admin', accessRole: 'ADMIN', name: 'Admin' });
    await setDoc(doc(db, 'users', 'client'), { role: 'Client', accessRole: 'USER', personas: ['CLIENT'], name: 'Client' });
    await setDoc(doc(db, 'users', 'recovery'), { role: 'Recovery', accessRole: 'USER', personas: ['RECOVERY'], name: 'Recovery Officer' });
    await setDoc(doc(db, 'users', 'recovery2'), { role: 'Recovery', accessRole: 'USER', personas: ['RECOVERY'], name: 'Second Recovery Officer' });
    await setDoc(doc(db, 'users', 'legal'), { role: 'Legal', accessRole: 'USER', personas: ['LEGAL'], name: 'Legal Officer' });
    await setDoc(doc(db, 'users', 'legal2'), { role: 'Legal', accessRole: 'USER', personas: ['LEGAL'], name: 'Second Legal Officer' });
    await setDoc(doc(db, 'conversations', 'conversation'), { participantIds: ['client', 'admin'], lastMessage: '' });
  });
});

after(async () => env?.cleanup());

test('clients cannot create role-bearing user profiles', async () => {
  const db = env.authenticatedContext('attacker').firestore();
  await assertFails(setDoc(doc(db, 'users', 'attacker'), { role: 'Admin', accessRole: 'ADMIN' }));
});

test('users may edit safe profile fields but not access fields', async () => {
  const db = env.authenticatedContext('client').firestore();
  await assertSucceeds(updateDoc(doc(db, 'users', 'client'), {
    name: 'Updated Client',
    phoneNumber: '+2348012345678',
    address: '12 Valid Residential Avenue, Kano',
    bankName: 'Taj Bank',
    bankAccountName: 'Updated Client',
    bankAccountNumber: '0123456789',
  }));
  await assertFails(updateDoc(doc(db, 'users', 'client'), { bankAccountNumber: 'not-an-account' }));
  await assertFails(updateDoc(doc(db, 'users', 'client'), { accessRole: 'ADMIN' }));
});

test('users may save only their own Firebase Storage profile photograph', async () => {
  const db = env.authenticatedContext('client').firestore();
  const validUrl = 'https://firebasestorage.googleapis.com/v0/b/studio-1298078893-e7941.firebasestorage.app/o/users%2Fclient%2Fprofile%2Fphoto.jpg?alt=media';
  await assertSucceeds(updateDoc(doc(db, 'users', 'client'), {
    photoURL: validUrl,
    photoStoragePath: 'users/client/profile/photo.jpg',
  }));
  await assertFails(updateDoc(doc(db, 'users', 'client'), {
    photoURL: 'https://attacker.example/photo.jpg',
    photoStoragePath: 'users/client/profile/photo.jpg',
  }));
  await assertFails(updateDoc(doc(db, 'users', 'client'), {
    photoURL: validUrl,
    photoStoragePath: 'users/admin/profile/photo.jpg',
  }));
});

test('non-admin users cannot write financial ledgers', async () => {
  const clientDb = env.authenticatedContext('client').firestore();
  const adminDb = env.authenticatedContext('admin').firestore();
  await assertFails(setDoc(doc(clientDb, 'fundBatches', 'forged'), { sourceId: 'client', remainingAmount: 999999 }));
  await assertSucceeds(setDoc(doc(adminDb, 'fundBatches', 'valid'), { sourceId: 'client', remainingAmount: 100 }));
});

test('conversation participants cannot rewrite membership', async () => {
  const db = env.authenticatedContext('client').firestore();
  await assertSucceeds(getDoc(doc(db, 'conversations', 'conversation')));
  await assertFails(updateDoc(doc(db, 'conversations', 'conversation'), { participantIds: ['client', 'attacker'] }));
});

test('message sender must match the authenticated participant', async () => {
  const db = env.authenticatedContext('client').firestore();
  await assertSucceeds(setDoc(doc(db, 'conversations/conversation/messages/valid'), { senderId: 'client', text: 'hello' }));
  await assertFails(setDoc(doc(db, 'conversations/conversation/messages/spoofed'), { senderId: 'admin', text: 'forged' }));
});

test('agreement signing records cannot be read or forged from client SDKs', async () => {
  const clientDb = env.authenticatedContext('client').firestore();
  const adminDb = env.authenticatedContext('admin').firestore();
  for (const db of [clientDb, adminDb]) {
    await assertFails(setDoc(doc(db, 'agreementEnvelopes', 'forged'), { status: 'EXECUTED' }));
    await assertFails(setDoc(doc(db, 'agreementEnvelopes/forged/signatures/INVESTOR'), { signerName: 'Forged' }));
    await assertFails(setDoc(doc(db, 'agreementSigningInvites', 'token'), { pinHash: 'exposed' }));
    await assertFails(getDoc(doc(db, 'agreementEnvelopes', 'secret')));
  }
});

test('repayment-plan requests are readable by the client and admin but writable only by the server', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'repaymentPlanChangeRequests', 'request'), {
      clientId: 'client', status: 'Pending', dealId: 'deal',
    });
  });
  const clientDb = env.authenticatedContext('client').firestore();
  const adminDb = env.authenticatedContext('admin').firestore();
  const attackerDb = env.authenticatedContext('attacker').firestore();
  await assertSucceeds(getDoc(doc(clientDb, 'repaymentPlanChangeRequests', 'request')));
  await assertSucceeds(getDoc(doc(adminDb, 'repaymentPlanChangeRequests', 'request')));
  await assertFails(getDoc(doc(attackerDb, 'repaymentPlanChangeRequests', 'request')));
  await assertFails(updateDoc(doc(clientDb, 'repaymentPlanChangeRequests', 'request'), { status: 'Approved' }));
  await assertFails(updateDoc(doc(adminDb, 'repaymentPlanChangeRequests', 'request'), { status: 'Approved' }));
});

test('transactional pending check permits only one concurrent approval', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const requestRef = doc(db, 'depositRequests', 'request');
    await setDoc(requestRef, { status: 'Pending', investorId: 'client', amount: 100 });
    const approve = () => runTransaction(db, async (trx) => {
      const snapshot = await trx.get(requestRef);
      if (snapshot.data()?.status !== 'Pending') throw new Error('already processed');
      trx.update(requestRef, { status: 'Approved' });
      trx.set(doc(collection(db, 'transactions')), { sourceRequestId: 'request', amount: 100 });
    });
    const results = await Promise.allSettled([approve(), approve()]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal((await getDocs(collection(db, 'transactions'))).size, 1);
  });
});

test('recovery and legal queues are stage- and assignment-scoped', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const dueDate = Timestamp.fromDate(new Date('2026-08-10T00:00:00Z'));
    await setDoc(doc(db, 'recoveryTasks', 'recovery-unassigned'), { status: 'OVERDUE', assigneeId: null, dueDate });
    await setDoc(doc(db, 'recoveryTasks', 'recovery-mine'), { status: 'PROMISE_TO_PAY', assigneeId: 'recovery', dueDate });
    await setDoc(doc(db, 'recoveryTasks', 'recovery-other'), { status: 'OVERDUE', assigneeId: 'recovery2', dueDate });
    await setDoc(doc(db, 'recoveryTasks', 'legal-unassigned'), { status: 'ESCALATED_LEGAL', assigneeId: null, dueDate });
    await setDoc(doc(db, 'recoveryTasks', 'legal-mine'), { status: 'DEMAND_ISSUED', assigneeId: 'legal', dueDate });
    await setDoc(doc(db, 'recoveryTasks', 'legal-other'), { status: 'NEGOTIATION', assigneeId: 'legal2', dueDate });
    await setDoc(doc(db, 'recoveryTasks/recovery-mine/logs', 'log'), { text: 'Scoped recovery log' });
    await setDoc(doc(db, 'recoveryTasks/legal-mine/logs', 'log'), { text: 'Scoped legal log' });
  });
  const recoveryDb = env.authenticatedContext('recovery').firestore();
  const legalDb = env.authenticatedContext('legal').firestore();
  await assertSucceeds(getDoc(doc(recoveryDb, 'recoveryTasks', 'recovery-unassigned')));
  await assertSucceeds(getDoc(doc(recoveryDb, 'recoveryTasks', 'recovery-mine')));
  await assertFails(getDoc(doc(recoveryDb, 'recoveryTasks', 'recovery-other')));
  await assertFails(getDoc(doc(recoveryDb, 'recoveryTasks', 'legal-unassigned')));
  await assertSucceeds(getDoc(doc(legalDb, 'recoveryTasks', 'legal-unassigned')));
  await assertSucceeds(getDoc(doc(legalDb, 'recoveryTasks', 'legal-mine')));
  await assertFails(getDoc(doc(legalDb, 'recoveryTasks', 'legal-other')));
  await assertFails(getDoc(doc(legalDb, 'recoveryTasks', 'recovery-unassigned')));
  await assertSucceeds(getDoc(doc(recoveryDb, 'recoveryTasks/recovery-mine/logs', 'log')));
  await assertFails(getDoc(doc(recoveryDb, 'recoveryTasks/legal-mine/logs', 'log')));
  await assertSucceeds(getDoc(doc(legalDb, 'recoveryTasks/legal-mine/logs', 'log')));
});

test('operational staff can query only their queue and cannot forge case logs', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const dueDate = Timestamp.fromDate(new Date('2026-08-10T00:00:00Z'));
    await setDoc(doc(db, 'recoveryTasks', 'mine'), { status: 'OVERDUE', assigneeId: 'recovery', dueDate });
    await setDoc(doc(db, 'recoveryTasks', 'legal'), { status: 'DEMAND_ISSUED', assigneeId: 'legal', dueDate });
  });
  const recoveryDb = env.authenticatedContext('recovery').firestore();
  const legalDb = env.authenticatedContext('legal').firestore();
  await assertSucceeds(getDocs(query(collection(recoveryDb, 'recoveryTasks'), where('status', 'in', ['OVERDUE']), where('assigneeId', '==', 'recovery'), orderBy('dueDate'))));
  await assertSucceeds(getDocs(query(collection(legalDb, 'recoveryTasks'), where('status', 'in', ['DEMAND_ISSUED']), where('assigneeId', '==', 'legal'), orderBy('dueDate'))));
  await assertFails(setDoc(doc(recoveryDb, 'recoveryTasks/mine/logs', 'forged'), { text: 'Forged from browser' }));
  await assertFails(setDoc(doc(legalDb, 'recoveryTasks/legal/logs', 'forged'), { text: 'Forged from browser' }));
});

test('legal staff cannot enumerate unrelated financial or user records', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'transactions', 'private'), { userId: 'client', amount: 500 });
    await setDoc(doc(db, 'repayments', 'private'), { clientId: 'client', amount: 500 });
  });
  const legalDb = env.authenticatedContext('legal').firestore();
  await assertSucceeds(getDoc(doc(legalDb, 'users', 'legal')));
  await assertFails(getDoc(doc(legalDb, 'users', 'client')));
  await assertFails(getDocs(collection(legalDb, 'users')));
  await assertFails(getDoc(doc(legalDb, 'transactions', 'private')));
  await assertFails(getDoc(doc(legalDb, 'repayments', 'private')));
});
