import assert from 'node:assert/strict';
import test from 'node:test';
import { canWriteAdmin, getAccessiblePortals, isReadOnlyOwner } from '../src/lib/access-control';

test('owner authority requires an explicit current OWNER role', () => {
  assert.equal(isReadOnlyOwner({ role: 'Admin' }), false);
  assert.equal(isReadOnlyOwner({ role: 'Owner' as any }), false);
  assert.equal(isReadOnlyOwner({ accessRole: 'OWNER' }), true);
  for (const accessRole of ['USER', 'STAFF', 'ADMIN', null, 'INVALID']) {
    assert.equal(isReadOnlyOwner({ role: 'Admin', accessRole: accessRole as any }), false);
  }
});

test('explicit restricted or invalid roles never fall back to legacy Admin', () => {
  for (const accessRole of ['STAFF', 'OWNER', 'USER', null, 'INVALID', '']) {
    assert.equal(canWriteAdmin({ role: 'Admin', roles: ['Admin'], accessRole: accessRole as any }), false);
  }
  assert.equal(canWriteAdmin({ role: 'Admin' }), true);
  assert.equal(canWriteAdmin({ role: 'Client', accessRole: 'ADMIN' }), true);
});

test('legacy and current administrators can switch to every portal they may access', () => {
  const expected = ['admin', 'investor', 'client', 'legal', 'recovery', 'marketer'];

  assert.deepEqual(getAccessiblePortals({ role: 'Admin' }), expected);
  assert.deepEqual(
    getAccessiblePortals({
      accessRole: 'ADMIN',
      personas: ['INVESTOR', 'CLIENT'],
      primaryPortal: 'admin',
    }),
    expected
  );
});

test('owners can switch between owner, admin, and every operational portal', () => {
  assert.deepEqual(
    getAccessiblePortals({ accessRole: 'OWNER', primaryPortal: 'owner' }),
    ['owner', 'admin', 'investor', 'client', 'legal', 'recovery', 'marketer']
  );
});

test('ordinary users see only their assigned personas', () => {
  assert.deepEqual(
    getAccessiblePortals({
      accessRole: 'USER',
      personas: ['INVESTOR', 'CLIENT'],
      primaryPortal: 'investor',
    }),
    ['investor', 'client']
  );
});
