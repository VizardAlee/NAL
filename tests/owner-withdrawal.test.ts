import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerWithdrawalRequestId } from '../src/lib/server/owner-withdrawal';

test('an owner and withdrawal window always map to one deterministic request document', () => {
  const first = ownerWithdrawalRequestId('owner-1', 'Q3 2026');
  assert.equal(first, ownerWithdrawalRequestId('owner-1', 'Q3 2026'));
  assert.notEqual(first, ownerWithdrawalRequestId('owner-1', 'Q4 2026'));
  assert.notEqual(first, ownerWithdrawalRequestId('owner-2', 'Q3 2026'));
  assert.match(first, /^owner_[a-f0-9]{32}$/);
});
