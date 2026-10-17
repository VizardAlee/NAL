import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPositiveCurrencyAmount } from '../src/lib/financial-integrity';
import { calculateProfitAvailability } from '../src/lib/profit-availability';

const now = new Date('2026-10-02T12:00:00Z');
const batch = { id: 'principal', amount: 100, remainingAmount: 0, createdAt: new Date('2026-01-01T12:00:00Z'), tenureValue: 90, tenureUnit: 'Days' as const };
const earned = { type: 'ProfitDistribution', amount: 40, fundBatchId: 'principal', createdAt: new Date('2026-02-01T12:00:00Z') };
const base = { fundBatches: [batch], entries: [earned], withdrawalRequests: [], reinvestmentRequests: [], now };

test('monetary boundaries reject malformed and fractional-kobo amounts without rejecting one kobo', () => {
  for (const value of [-1, 0, 0.001, 1e-9, NaN, Infinity, '10', Number.MAX_SAFE_INTEGER]) assert.throws(() => assertPositiveCurrencyAmount(value));
  assert.equal(assertPositiveCurrencyAmount(0.01), 0.01);
  assert.equal(assertPositiveCurrencyAmount(1.01), 1.01);
});

test('realised profit is available independently of principal cash and capital withdrawals', () => {
  const result = calculateProfitAvailability({ ...base, entries: [earned, { type: 'Withdrawal', amount: -100, metadata: { source: 'Capital' } }] });
  assert.equal(result.availableProfit, 40);
  assert.equal(result.reinvestibleProfit, 40);
});

test('both pending profit pools share reservations without reserving principal or owner cash', () => {
  const result = calculateProfitAvailability({ ...base, entries: [earned, { type: 'Withdrawal', amount: -4, metadata: { source: 'ShortTermProfit' } }, { type: 'Withdrawal', amount: -5, metadata: { source: 'ProfitReinvestment' } }], withdrawalRequests: [{ status: 'Pending', source: 'ShortTermProfit', amount: 10 }, { status: 'Pending', source: 'Capital', amount: 100 }, { status: 'Pending', type: 'OwnerWithdrawal', amount: 100 }], reinvestmentRequests: [{ status: 'Pending', amount: 20 }] });
  assert.equal(result.availableProfit, 1);
  assert.equal(result.reinvestibleProfit, 1);
});

test('locked, missing and foreign-linked profit cannot bypass maturity through approval availability', () => {
  const future = { ...batch, createdAt: new Date('2026-09-01T12:00:00Z'), tenureValue: 365 };
  assert.equal(calculateProfitAvailability({ ...base, fundBatches: [future] }).availableProfit, 0);
  assert.equal(calculateProfitAvailability({ ...base, fundBatches: [] }).availableProfit, 0);
  assert.equal(calculateProfitAvailability({ ...base, entries: [{ type: 'ProfitDistribution', amount: 40, createdAt: now }] }).availableProfit, 0);
});

test('an annual exception uses its ledger allowance even when all principal is invested', () => {
  const long = { ...batch, createdAt: new Date('2025-10-01T12:00:00Z'), tenureValue: 3, tenureUnit: 'Years' as const };
  const result = calculateProfitAvailability({ ...base, fundBatches: [long], entries: [{ ...earned, amount: 20, createdAt: new Date('2026-09-20T12:00:00Z') }] });
  assert.equal(result.window.availableToWithdraw, 4);
  assert.equal(result.availableProfit, 0);
  assert.equal(result.globallyAvailableProfit, 20);
  assert.equal(result.reinvestibleProfit, 0);
});

test('malformed legacy reservations fail closed instead of increasing availability', () => {
  const result = calculateProfitAvailability({ ...base, reinvestmentRequests: [{ status: 'Pending', amount: -100 }] });
  assert.equal(result.reservationsBlocked, true);
  assert.equal(result.availableProfit, 0);
  assert.equal(result.reinvestibleProfit, 0);
});
