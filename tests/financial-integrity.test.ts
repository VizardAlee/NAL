import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateCurrencyByWeights,
  allocatePartialRepayment,
  calculateAvailableProfit,
  calculateFundBatchAnniversaryWindow,
  calculateInvestorPortfolioValue,
  roundCurrency,
} from '../src/lib/financial-integrity';

test('partial repayments allocate only the amount actually paid', () => {
  const allocation = allocatePartialRepayment(28_000, {
    principal: 100_000,
    interest: 12_000,
    payment: 112_000,
  });
  assert.deepEqual(allocation, { principal: 25_000, interest: 3_000, ratio: 0.25 });
});

test('repayment currency is rounded to two decimal places', () => {
  assert.equal(roundCurrency(10.125), 10.13);
  assert.equal(roundCurrency(0.1 + 0.2), 0.3);

  const allocation = allocatePartialRepayment(33.333333, {
    principal: 80,
    interest: 20,
    payment: 100,
  });
  assert.equal(allocation.principal, 26.66);
  assert.equal(allocation.interest, 6.67);
});

test('weighted repayment distributions remain in kobo and preserve their total', () => {
  const shares = allocateCurrencyByWeights(10, [1, 1, 1]);
  assert.deepEqual(shares, [3.34, 3.33, 3.33]);
  assert.equal(roundCurrency(shares.reduce((sum, share) => sum + share, 0)), 10);
});

test('portfolio value is unchanged when capital is deployed into a deal', () => {
  assert.equal(calculateInvestorPortfolioValue([
    { type: 'Deposit', amount: 1_000_000 },
    { type: 'Investment', amount: -800_000 },
    { type: 'ProfitDistribution', amount: 40_000 },
    { type: 'Withdrawal', amount: -100_000 },
  ]), 940_000);
});

test('available profit deducts completed consumption and pending reservations', () => {
  assert.equal(calculateAvailableProfit([
    { type: 'ProfitDistribution', amount: 50_000 },
    { type: 'Withdrawal', amount: -10_000, metadata: { source: 'ProfitReinvestment' } },
    { type: 'Withdrawal', amount: -5_000, metadata: { source: 'ShortTermProfit' } },
    { type: 'Withdrawal', amount: -2_500 },
  ], 7_500), 25_000);
});

test('a batch locked over two years gets a five-day annual 20% profit window', () => {
  const common = {
    fundBatches: [{
      id: 'batch-1', tenureValue: 3, tenureUnit: 'Years' as const,
      createdAt: new Date('2025-01-10T09:00:00Z'),
    }],
    entries: [
      { type: 'ProfitDistribution', fundBatchId: 'batch-1', amount: 250_000, createdAt: new Date('2025-12-20T00:00:00Z') },
      { type: 'ProfitDistribution', fundBatchId: 'batch-1', amount: 50_000, createdAt: new Date('2026-01-11T00:00:00Z') },
    ],
  };

  assert.equal(calculateFundBatchAnniversaryWindow({ ...common, now: new Date('2026-01-10T08:59:59Z') }).isOpen, false);
  const firstYear = calculateFundBatchAnniversaryWindow({ ...common, now: new Date('2026-01-10T09:00:00Z') });
  assert.equal(firstYear.isOpen, true);
  assert.equal(firstYear.activeWindows[0]?.anniversaryYear, 1);
  assert.equal(firstYear.generatedProfit, 250_000);
  assert.equal(firstYear.allowance, 50_000);
  assert.equal(firstYear.availableToWithdraw, 50_000);
  assert.equal(firstYear.reinvestmentReserve, 50_000);
  assert.equal(calculateFundBatchAnniversaryWindow({ ...common, now: new Date('2026-01-15T09:00:00Z') }).isOpen, false);
  assert.equal(calculateFundBatchAnniversaryWindow({ ...common, now: new Date('2028-01-10T10:00:00Z') }).isOpen, false);
});

test('the annual allowance resets and pending or approved withdrawals consume only that year', () => {
  const common = {
    fundBatches: [{
      id: 'batch-1', tenureValue: 3, tenureUnit: 'Years' as const,
      createdAt: new Date('2024-01-10T09:00:00Z'),
    }],
    entries: [
      { type: 'ProfitDistribution', fundBatchId: 'batch-1', amount: 100_000, createdAt: new Date('2024-12-01T00:00:00Z') },
      { type: 'ProfitDistribution', fundBatchId: 'batch-1', amount: 150_000, createdAt: new Date('2025-12-01T00:00:00Z') },
    ],
    now: new Date('2026-01-11T00:00:00Z'),
  };
  const secondYear = calculateFundBatchAnniversaryWindow(common);
  assert.deepEqual(secondYear.windowIds, ['batch-1:year-2']);
  assert.equal(secondYear.generatedProfit, 150_000);
  assert.equal(secondYear.allowance, 30_000);

  const withRequests = calculateFundBatchAnniversaryWindow({
    ...common,
    withdrawalRequests: [
      { source: 'AnniversaryProfit', status: 'Approved', amount: 20_000, anniversaryWindowIds: ['batch-1:year-1'] },
      { source: 'AnniversaryProfit', status: 'Pending', amount: 5_000, anniversaryWindowIds: secondYear.windowIds },
      { source: 'AnniversaryProfit', status: 'Approved', amount: 7_000, anniversaryWindowIds: secondYear.windowIds },
    ],
  });
  assert.equal(withRequests.availableToWithdraw, 18_000);
  assert.equal(withRequests.reinvestmentReserve, 23_000);
});

test('batches locked for two years or less do not qualify', () => {
  const result = calculateFundBatchAnniversaryWindow({
    fundBatches: [{ id: 'batch-1', tenureValue: 2, tenureUnit: 'Years', createdAt: new Date('2025-01-01T00:00:00Z') }],
    entries: [{ type: 'ProfitDistribution', fundBatchId: 'batch-1', amount: 100_000, createdAt: new Date('2025-12-01T00:00:00Z') }],
    now: new Date('2026-01-02T00:00:00Z'),
  });
  assert.equal(result.isOpen, false);
  assert.equal(result.allowance, 0);
});
