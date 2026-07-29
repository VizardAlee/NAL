import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAmortizationSchedule } from '../src/lib/amortization';
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

test('equal installments preserve principal and total profit to the kobo', () => {
  const schedule = generateAmortizationSchedule(deal());
  assert.equal(schedule.length, 12);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.principal, 0).toFixed(2)), 1_000_000);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.interest, 0).toFixed(2)), 120_000);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.payment, 0).toFixed(2)), 1_120_000);
  assert.equal(schedule.at(-1)?.balance, 0);
});

test('balloon schedule returns principal only in the final installment', () => {
  const schedule = generateAmortizationSchedule(deal({ repaymentType: 'Balloon Payment' }));
  assert.ok(schedule.slice(0, -1).every((row) => row.principal === 0));
  assert.equal(schedule.at(-1)?.principal, 1_000_000);
  assert.equal(Number(schedule.reduce((sum, row) => sum + row.interest, 0).toFixed(2)), 120_000);
});

test('month-end schedules remain ordered and finite', () => {
  const schedule = generateAmortizationSchedule(deal({ createdAt: timestamp(new Date('2028-01-31T00:00:00Z')) }));
  assert.ok(schedule.every((row) => Number.isFinite(row.payment) && row.payment >= 0));
  assert.ok(schedule.every((row, index) => index === 0 || row.dueDate > schedule[index - 1].dueDate));
});
