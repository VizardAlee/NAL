import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

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
  await assertSucceeds(updateDoc(doc(db, 'users', 'client'), { name: 'Updated Client' }));
  await assertFails(updateDoc(doc(db, 'users', 'client'), { accessRole: 'ADMIN' }));
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
