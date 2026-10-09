import assert from 'node:assert/strict';
import test from 'node:test';
import { profileCanWriteAdmin, requireFullAdmin } from '../functions/src/admin-access';

test('callable admin authority uses the current profile, never a legacy role over a modern role', async () => {
  for (const accessRole of ['OWNER', 'STAFF', 'USER', '', null]) {
    assert.equal(profileCanWriteAdmin({ role: 'Admin', roles: ['Admin'], accessRole }), false);
    await assert.rejects(requireFullAdmin('caller', async () => ({ role: 'Admin', accessRole })), /Administrator write access/);
  }
  assert.equal(profileCanWriteAdmin(undefined), false);
  assert.equal(profileCanWriteAdmin({ role: 'Client', accessRole: 'ADMIN' }), true);
  assert.equal(profileCanWriteAdmin({ role: 'Admin' }), true);
  await assert.rejects(requireFullAdmin(undefined), /Sign in/);
  await assert.rejects(requireFullAdmin('deleted', async () => undefined), /Administrator write access/);
  assert.equal(await requireFullAdmin('admin', async () => ({ accessRole: 'ADMIN' })), 'admin');
});
