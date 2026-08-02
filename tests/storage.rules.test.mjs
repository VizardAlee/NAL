import { after, before, beforeEach, test } from 'node:test';
import fs from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nal',
    firestore: { rules: await fs.readFile('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8088 },
    storage: { rules: await fs.readFile('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

beforeEach(async () => {
  await Promise.all([env.clearFirestore(), env.clearStorage()]);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'admin'), { role: 'Admin', accessRole: 'ADMIN' });
    await setDoc(doc(db, 'users', 'staff'), { role: 'Admin', accessRole: 'STAFF' });
    await setDoc(doc(db, 'conversations', 'conversation'), { participantIds: ['client', 'admin'] });
  });
});

after(async () => env?.cleanup());

const pdfMetadata = { contentType: 'application/pdf' };
const jpegMetadata = { contentType: 'image/jpeg' };

test('users can upload their own proposal but not another user’s', async () => {
  const storage = env.authenticatedContext('client').storage();
  await assertSucceeds(storage.ref('users/client/proposals/proposal.pdf').putString('proposal', 'raw', pdfMetadata));
  await assertFails(storage.ref('users/other/proposals/proposal.pdf').putString('proposal', 'raw', pdfMetadata));
});

test('users can upload their own profile photo but not another user’s photo', async () => {
  const user = env.authenticatedContext('client').storage();
  await assertSucceeds(user.ref('users/client/profile/photo.jpg').putString('photo', 'raw', jpegMetadata));
  await assertFails(user.ref('users/other/profile/photo.jpg').putString('photo', 'raw', jpegMetadata));
  await assertFails(user.ref('users/client/profile/photo.pdf').putString('photo', 'raw', pdfMetadata));
});

test('guarantor photographs require an authenticated owner and an image file', async () => {
  const client = env.authenticatedContext('client').storage();
  const other = env.authenticatedContext('other').storage();
  await assertSucceeds(client.ref('users/client/guarantors/photo.jpg').putString('photo', 'raw', jpegMetadata));
  await assertFails(other.ref('users/client/guarantors/photo.jpg').putString('photo', 'raw', jpegMetadata));
  await assertFails(client.ref('users/client/guarantors/document.pdf').putString('photo', 'raw', pdfMetadata));
});

test('conversation attachments require membership and matching uploader identity', async () => {
  const member = env.authenticatedContext('client').storage();
  const outsider = env.authenticatedContext('outsider').storage();
  await assertSucceeds(member.ref('conversations/conversation/client/attachment.pdf').putString('message', 'raw', pdfMetadata));
  await assertFails(outsider.ref('conversations/conversation/outsider/attachment.pdf').putString('message', 'raw', pdfMetadata));
});

test('only full administrators can upload legal documents', async () => {
  const admin = env.authenticatedContext('admin').storage();
  const staff = env.authenticatedContext('staff').storage();
  await assertSucceeds(admin.ref('admin/admin/legal/client/document.pdf').putString('legal', 'raw', pdfMetadata));
  await assertFails(staff.ref('admin/staff/legal/client/document.pdf').putString('legal', 'raw', pdfMetadata));
});

test('executed agreement archives cannot be accessed directly by clients or admins', async () => {
  const admin = env.authenticatedContext('admin').storage();
  const client = env.authenticatedContext('client').storage();
  const path = 'agreement-archives/mudaraba_batch/final.pdf';
  await assertFails(admin.ref(path).putString('signed agreement', 'raw', pdfMetadata));
  await assertFails(client.ref(path).putString('signed agreement', 'raw', pdfMetadata));
  await assertFails(admin.ref(path).getDownloadURL());
});

test('uploads over five megabytes are rejected', async () => {
  const storage = env.authenticatedContext('client').storage();
  await assertFails(
    storage.ref('users/client/proposals/large.pdf').putString('x'.repeat(5 * 1024 * 1024 + 1), 'raw', pdfMetadata)
  );
});
