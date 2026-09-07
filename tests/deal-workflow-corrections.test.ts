import assert from 'node:assert/strict';
import test from 'node:test';
import { addDealDuration, calculateInclusiveMaturityDate, durationToDays } from '../src/lib/deal-duration';
import { formatMoneyInput, parseMoneyInput } from '../src/components/ui/money-input';
import { isAgreementExecuted, isBatchProfitLocked, isProfitDistributionLocked, lockedUntilForBatch, profitUnlockDate, requiredDealAgreementTypes, requiresAgreementSigning, requiresManagementFee } from '../src/lib/workflow-eligibility';
import { sortDefaulterRecords, sortRepaymentRecords } from '../src/lib/operational-ordering';

test('deal months always mean exactly 30 days across calendar boundaries', () => {
  assert.equal(durationToDays(1, 'Months'), 30);
  assert.equal(durationToDays(2, 'Months'), 60);
  assert.equal(durationToDays(3, 'Months'), 90);
  assert.equal(durationToDays(6, 'Months'), 180);
  assert.equal(durationToDays(12, 'Months'), 360);
  assert.equal(addDealDuration(new Date('2024-02-01T00:00:00Z'), 1, 'Months').toISOString(), '2024-03-02T00:00:00.000Z');
  assert.equal(addDealDuration(new Date('2025-02-01T00:00:00Z'), 1, 'Months').toISOString(), '2025-03-03T00:00:00.000Z');
  assert.equal(addDealDuration(new Date('2026-12-15T00:00:00Z'), 2, 'Months').toISOString(), '2027-02-13T00:00:00.000Z');
  assert.equal(calculateInclusiveMaturityDate(new Date('2026-01-01T00:00:00Z'), 1, 'Months').toISOString(), '2026-01-30T00:00:00.000Z');
});

test('money input formats live, remains empty when cleared, and submits raw values', () => {
  assert.equal(formatMoneyInput('1000'), '1,000');
  assert.equal(formatMoneyInput('1000000.25'), '1,000,000.25');
  assert.equal(formatMoneyInput('1000000.'), '1,000,000.');
  assert.equal(formatMoneyInput(''), '');
  assert.equal(parseMoneyInput('1,000,000.25'), 1_000_000.25);
  assert.equal(parseMoneyInput(''), null);
});

test('profit on investments longer than 90 days stays locked until complete maturity', () => {
  const createdAt = new Date('2026-01-01T00:00:00Z');
  const ninety = { tenureValue: 3, tenureUnit: 'Months', createdAt };
  const sixty = { tenureValue: 2, tenureUnit: 'Months', createdAt };
  const ninetyOne = { tenureValue: 91, tenureUnit: 'Days', createdAt };
  const oneTwenty = { tenureValue: 4, tenureUnit: 'Months', createdAt };
  const oneEighty = { tenureValue: 6, tenureUnit: 'Months', createdAt };
  const threeSixty = { tenureValue: 12, tenureUnit: 'Months', createdAt };
  assert.equal(isBatchProfitLocked(sixty, new Date('2026-01-02T00:00:00Z')), false);
  assert.equal(lockedUntilForBatch(ninety), null);
  assert.equal(isBatchProfitLocked(ninety, new Date('2026-01-02T00:00:00Z')), false);
  assert.equal(isBatchProfitLocked(ninetyOne, new Date('2026-04-01T00:00:00Z')), true);
  assert.equal(isBatchProfitLocked(ninetyOne, new Date('2026-04-02T00:00:00Z')), false);
  assert.equal(isBatchProfitLocked(oneTwenty, new Date('2026-04-30T23:59:59Z')), true);
  assert.equal(isBatchProfitLocked(oneTwenty, new Date('2026-05-01T00:00:00Z')), false);
  assert.equal(isBatchProfitLocked(oneEighty, new Date('2026-06-29T23:59:59Z')), true);
  assert.equal(isBatchProfitLocked(oneEighty, new Date('2026-06-30T00:00:00Z')), false);
  assert.equal(isBatchProfitLocked(threeSixty, new Date('2026-12-26T23:59:59Z')), true);
  assert.equal(isBatchProfitLocked(threeSixty, new Date('2026-12-27T00:00:00Z')), false);
});

test('a 90-day investment releases each profit tranche only after its 30-day period completes', () => {
  const batch = { tenureValue: 3, tenureUnit: 'Months', paymentDate: new Date('2026-01-01T00:00:00Z') };
  const firstPeriodProfit = { profitEarnedAt: new Date('2026-01-11T00:00:00Z') };
  const secondPeriodProfit = { profitEarnedAt: new Date('2026-02-01T00:00:00Z') };
  const thirdPeriodProfit = { profitEarnedAt: new Date('2026-03-03T00:00:00Z') };

  assert.equal(profitUnlockDate(batch, firstPeriodProfit)?.toISOString(), '2026-01-31T00:00:00.000Z');
  assert.equal(isProfitDistributionLocked(batch, firstPeriodProfit, new Date('2026-01-30T23:59:59Z')), true);
  assert.equal(isProfitDistributionLocked(batch, firstPeriodProfit, new Date('2026-01-31T00:00:00Z')), false);
  assert.equal(profitUnlockDate(batch, secondPeriodProfit)?.toISOString(), '2026-03-02T00:00:00.000Z');
  assert.equal(isProfitDistributionLocked(batch, secondPeriodProfit, new Date('2026-03-01T23:59:59Z')), true);
  assert.equal(isProfitDistributionLocked(batch, secondPeriodProfit, new Date('2026-03-02T00:00:00Z')), false);
  assert.equal(profitUnlockDate(batch, thirdPeriodProfit)?.toISOString(), '2026-04-01T00:00:00.000Z');
  assert.equal(isProfitDistributionLocked(batch, thirdPeriodProfit, new Date('2026-03-31T23:59:59Z')), true);
  assert.equal(isProfitDistributionLocked(batch, thirdPeriodProfit, new Date('2026-04-01T00:00:00Z')), false);
});

test('historical deal defaults remain compatible while new explicit flags win', () => {
  assert.equal(requiresManagementFee({ managementFeeAmount: 20_000 }), true);
  assert.equal(requiresManagementFee({ managementFeeAmount: 20_000, requiresManagementFee: false }), false);
  assert.equal(requiresAgreementSigning({}), true);
  assert.equal(requiresAgreementSigning({ agreementSigningRequired: false }), false);
  assert.deepEqual(requiredDealAgreementTypes({ financingMode: 'Murabaha' }), ['MURABAHA', 'KAFAALAH']);
  assert.deepEqual(requiredDealAgreementTypes({ financingMode: 'Murabaha', wakalahGranted: true }), ['MURABAHA', 'WAKALAH', 'KAFAALAH']);
  assert.deepEqual(requiredDealAgreementTypes({ financingMode: 'Murabaha', agreementSigningRequired: false }), []);
  assert.equal(isAgreementExecuted({ status: 'EXECUTED' }), true);
  assert.equal(isAgreementExecuted({ status: 'AWAITING_COMPANY' }), false);
});

test('repayment requests and daily defaulters use deterministic operational priority', () => {
  const repayments = sortRepaymentRecords([
    { id: 'approved', status: 'Approved', dueDate: new Date('2026-01-01') },
    { id: 'pending-later', status: 'Pending', dueDate: new Date('2026-01-03'), installmentNumber: 2 },
    { id: 'pending-next', status: 'Pending', dueDate: new Date('2026-01-02'), installmentNumber: 1 },
  ]);
  assert.deepEqual(repayments.map((item) => item.id), ['pending-next', 'pending-later', 'approved']);

  const defaulters = sortDefaulterRecords([
    { id: 'monthly-severe', repaymentFrequency: 'Monthly', daysPastDue: 100, amountOutstanding: 1_000_000 },
    { id: 'daily-low', repaymentFrequency: 'Daily', daysPastDue: 2, amountOutstanding: 500 },
    { id: 'daily-high', repaymentFrequency: 'Daily', daysPastDue: 5, amountOutstanding: 100 },
  ]);
  assert.deepEqual(defaulters.map((item) => item.id), ['daily-high', 'daily-low', 'monthly-severe']);
});
