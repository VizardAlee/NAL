import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateRemainingRepaymentBalance,
  generateAmortizationSchedule,
} from '../src/lib/amortization';
import type { Deal } from '../src/lib/types';

const timestamp = (date: Date) => ({ toDate: () => date }) as Deal['createdAt'];

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal', dealName: 'Test Deal', clientId: 'client', clientName: 'Client',
    principal: 1_000_000, profitRate: 12, durationValue: 12, durationUnit: 'Months',
    repaymentType: 'Equal Installments', repaymentFrequency: 'Monthly', status: 'Active',
    createdAt: timestamp(new Date('2026-01-01T00:00:00Z')),
    ...overrides,
  } as Deal;
}

test('principal and profit remain uniform while preserving totals to the kobo', () => {
  const schedule = generateAmortizationSchedule(deal());
  const principalValues = schedule.map((row) => Math.round(row.principal * 100));
  const profitValues = schedule.map((row) => Math.round(row.interest * 100));
  assert.equal(schedule.length, 12);
  assert.ok(Math.max(...principalValues) - Math.min(...principalValues) <= 1);
  assert.ok(Math.max(...profitValues) - Math.min(...profitValues) <= 1);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.principal, 0).toFixed(2)), 1_000_000);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.interest, 0).toFixed(2)), 120_000);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.payment, 0).toFixed(2)), 1_120_000);
  assert.equal(schedule.at(-1)?.balance, 0);
});

test('legacy balloon deals also use uniform principal and profit repayments', () => {
  const schedule = generateAmortizationSchedule(deal({ repaymentType: 'Balloon Payment' }));
  const principalValues = schedule.map((row) => Math.round(row.principal * 100));
  const profitValues = schedule.map((row) => Math.round(row.interest * 100));
  assert.ok(Math.max(...principalValues) - Math.min(...principalValues) <= 1);
  assert.ok(Math.max(...profitValues) - Math.min(...profitValues) <= 1);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.principal, 0).toFixed(2)), 1_000_000);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.interest, 0).toFixed(2)), 120_000);
});

test('termination requires all unpaid principal and profit', () => {
  const settlement = calculateRemainingRepaymentBalance(deal(), [
    { amount: 93_333.34, installmentNumber: 1 },
  ]);

  assert.deepEqual(settlement, {
    remainingPrincipal: 916_666.66,
    remainingProfit: 110_000,
    totalRemaining: 1_026_666.66,
  });
});

test('termination uses recorded principal and profit allocations for partial payments', () => {
  const settlement = calculateRemainingRepaymentBalance(deal(), [
    { amount: 120_000, installmentNumber: 1, principalApplied: 100_000, interestApplied: 20_000 },
  ]);

  assert.deepEqual(settlement, {
    remainingPrincipal: 900_000,
    remainingProfit: 100_000,
    totalRemaining: 1_000_000,
  });
});

test('a fully repaid deal has no termination settlement remaining', () => {
  const schedule = generateAmortizationSchedule(deal());
  const settlement = calculateRemainingRepaymentBalance(
    deal(),
    schedule.map((installment) => ({
      amount: installment.payment,
      installmentNumber: installment.installment,
      principalApplied: installment.principal,
      interestApplied: installment.interest,
    }))
  );

  assert.deepEqual(settlement, {
    remainingPrincipal: 0,
    remainingProfit: 0,
    totalRemaining: 0,
  });
});

test('month-end schedules remain ordered and finite', () => {
  const schedule = generateAmortizationSchedule(deal({ createdAt: timestamp(new Date('2028-01-31T00:00:00Z')) }));
  assert.ok(schedule.every((row) => Number.isFinite(row.payment) && row.payment >= 0));
  assert.ok(schedule.every((row, index) => index === 0 || row.dueDate > schedule[index - 1].dueDate));
});
