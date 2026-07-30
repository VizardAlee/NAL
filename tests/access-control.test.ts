import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccessiblePortals } from '../src/lib/access-control';

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
