import assert from 'node:assert/strict';
import test from 'node:test';
import { generateAmortizationSchedule } from '../src/lib/amortization';
import { calculateRepaymentProgress } from '../src/lib/repayment-progress';
import type { Deal } from '../src/lib/types';

const timestamp = (date: Date) => ({ toDate: () => date }) as Deal['createdAt'];

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'deal',
    dealName: 'Gauge Deal',
    clientId: 'client',
    clientName: 'Client',
    principal: 1_000_000,
    profitRate: 20,
    durationValue: 3,
    durationUnit: 'Months',
    repaymentType: 'Equal Installments',
    repaymentFrequency: 'Daily',
    status: 'Active',
    createdAt: timestamp(new Date(2026, 0, 1)),
    ...overrides,
  } as Deal;
}

test('daily repayments crossing months use monthly major and weekly minor checkpoints', () => {
  const currentDeal = deal();
  const schedule = generateAmortizationSchedule(currentDeal);
  const progress = calculateRepaymentProgress(currentDeal.repaymentFrequency, schedule, []);

  assert.equal(progress.majorUnitLabel, 'month');
  assert.equal(progress.minorUnitLabel, 'week');
  assert.ok(progress.checkpoints.length >= 3);
  assert.ok(progress.checkpoints.some((checkpoint) => checkpoint.minorCheckpoints.length > 0));
  assert.equal(progress.progressPercent, 0);
  assert.equal(progress.totalRemaining, progress.totalScheduled);
});

test('weekly and fortnightly repayments aggregate into monthly checkpoints', () => {
  for (const repaymentFrequency of ['Weekly', 'Fortnightly'] as const) {
    const currentDeal = deal({ repaymentFrequency });
    const schedule = generateAmortizationSchedule(currentDeal);
    const progress = calculateRepaymentProgress(currentDeal.repaymentFrequency, schedule, []);

    assert.equal(progress.majorUnitLabel, 'month');
    assert.equal(progress.minorUnitLabel, 'week');
    assert.ok(progress.checkpoints.length >= 2);
  }
});

test('checkpoint calculations remain valid for every supported duration unit', () => {
  const scenarios: Array<Pick<Deal, 'durationValue' | 'durationUnit' | 'repaymentFrequency'>> = [
    { durationValue: 45, durationUnit: 'Days', repaymentFrequency: 'Daily' },
    { durationValue: 12, durationUnit: 'Weeks', repaymentFrequency: 'Weekly' },
    { durationValue: 8, durationUnit: 'Fortnights', repaymentFrequency: 'Fortnightly' },
    { durationValue: 18, durationUnit: 'Months', repaymentFrequency: 'Monthly' },
    { durationValue: 2, durationUnit: 'Years', repaymentFrequency: 'Monthly' },
  ];

  scenarios.forEach((scenario) => {
    const currentDeal = deal(scenario);
    const schedule = generateAmortizationSchedule(currentDeal);
    const progress = calculateRepaymentProgress(currentDeal.repaymentFrequency, schedule, []);

    assert.ok(progress.checkpoints.length > 0, scenario.durationUnit);
    assert.ok(Number.isFinite(progress.totalScheduled), scenario.durationUnit);
    assert.ok(progress.totalScheduled > 0, scenario.durationUnit);
    assert.equal(progress.totalRemaining, progress.totalScheduled, scenario.durationUnit);
  });
});

test('monthly repayments use quarters within one year and years across multiple years', () => {
  const annualDeal = deal({
    repaymentFrequency: 'Monthly',
    durationValue: 12,
    durationUnit: 'Months',
  });
  const annualProgress = calculateRepaymentProgress(
    annualDeal.repaymentFrequency,
    generateAmortizationSchedule(annualDeal),
    []
  );
  assert.equal(annualProgress.majorUnitLabel, 'quarter');
  assert.equal(annualProgress.minorUnitLabel, 'month');
  assert.ok(
    annualProgress.checkpoints.length >= 4 && annualProgress.checkpoints.length <= 5
  );

  const multiYearDeal = deal({
    repaymentFrequency: 'Monthly',
    durationValue: 2,
    durationUnit: 'Years',
  });
  const multiYearProgress = calculateRepaymentProgress(
    multiYearDeal.repaymentFrequency,
    generateAmortizationSchedule(multiYearDeal),
    []
  );
  assert.equal(multiYearProgress.majorUnitLabel, 'year');
  assert.equal(multiYearProgress.minorUnitLabel, 'month');
  assert.ok(multiYearProgress.checkpoints.length >= 2);
});

test('only approved repayments turn the gauge green', () => {
  const currentDeal = deal({
    repaymentFrequency: 'Monthly',
    durationValue: 3,
  });
  const schedule = generateAmortizationSchedule(currentDeal);
  const progress = calculateRepaymentProgress(currentDeal.repaymentFrequency, schedule, [
    {
      installmentNumber: 1,
      amount: schedule[0].payment,
      status: 'Approved',
    },
    {
      installmentNumber: 2,
      amount: schedule[1].payment,
      status: 'Pending',
    },
    {
      installmentNumber: 3,
      amount: schedule[2].payment,
      status: 'Rejected',
    },
  ]);

  assert.equal(progress.totalApproved, schedule[0].payment);
  assert.equal(progress.totalPending, schedule[1].payment);
  assert.ok(progress.progressPercent > 33 && progress.progressPercent < 34);
  assert.equal(progress.checkpoints[0].progressPercent, 100);
  assert.equal(progress.checkpoints[1].progressPercent, 0);
});

test('the entire gauge is green after every installment is approved', () => {
  const currentDeal = deal({
    repaymentFrequency: 'Monthly',
    durationValue: 12,
  });
  const schedule = generateAmortizationSchedule(currentDeal);
  const progress = calculateRepaymentProgress(
    currentDeal.repaymentFrequency,
    schedule,
    schedule.map((installment) => ({
      installmentNumber: installment.installment,
      amount: installment.payment,
      status: 'Approved',
    }))
  );

  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.totalRemaining, 0);
  assert.ok(progress.checkpoints.every((checkpoint) => checkpoint.progressPercent === 100));
});
