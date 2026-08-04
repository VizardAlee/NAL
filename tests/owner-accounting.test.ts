import test from 'node:test';
import assert from 'node:assert/strict';
import { assertValidOwnerConfiguration, calculateOwnerBalances } from '../src/lib/owner-accounting';

test('owner configuration requires assigned shares to equal the policy total', () => {
  assert.deepEqual(assertValidOwnerConfiguration({
    totalShares: 100,
    retainedPercent: 50,
    distributablePercent: 50,
    activeShareUnits: [60, 40],
  }), { activeShares: 100 });
  assert.throws(() => assertValidOwnerConfiguration({
    totalShares: 100,
    retainedPercent: 50,
    distributablePercent: 50,
    activeShareUnits: [50, 40],
  }), /configuration mismatch/i);
});

test('owner withdrawal is limited by both profit ledger and owner-origin liquid funds', () => {
  assert.deepEqual(calculateOwnerBalances({
    allocated: 1_000_000,
    approvedWithdrawals: 100_000,
    liquidOwnerFunds: 400_000,
    pendingWithdrawals: 50_000,
  }), {
    unwithdrawn: 900_000,
    withdrawable: 350_000,
    invested: 500_000,
  });
});

test('owner balances never expose negative or fractional-kobo values', () => {
  assert.deepEqual(calculateOwnerBalances({
    allocated: 100.005,
    approvedWithdrawals: 200,
    liquidOwnerFunds: -50,
  }), { unwithdrawn: 0, withdrawable: 0, invested: 0 });
});
