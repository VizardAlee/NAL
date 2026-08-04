import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInstallmentOutstanding,
  canTransitionRecoveryStatus,
  deriveAutomatedRecoveryStatus,
  recoveryTaskId,
} from '../src/lib/recovery';

test('recovery case ids are deterministic for a deal installment', () => {
  assert.equal(recoveryTaskId('deal/unsafe', 12), 'deal_unsafe_12');
  assert.equal(recoveryTaskId('deal/unsafe', 12), recoveryTaskId('deal/unsafe', 12));
});

test('partial approved payments leave an exact outstanding balance', () => {
  const balance = calculateInstallmentOutstanding(10_000, 2, [
    { status: 'Approved', installmentNumber: 2, amount: 2_500.25 },
    { status: 'Approved', installmentNumber: 2, amount: 499.75 },
    { status: 'Pending', installmentNumber: 2, amount: 7_000 },
    { status: 'Approved', installmentNumber: 1, amount: 5_000 },
  ]);
  assert.deepEqual(balance, {
    scheduledAmount: 10_000,
    amountPaid: 3_000,
    amountOutstanding: 7_000,
    fullyPaid: false,
  });
});

test('overpayments close an installment without producing a negative balance', () => {
  assert.deepEqual(
    calculateInstallmentOutstanding(1_000, 1, [{ status: 'Approved', installmentNumber: 1, amount: 1_500 }]),
    { scheduledAmount: 1_000, amountPaid: 1_000, amountOutstanding: 0, fullyPaid: true }
  );
});

test('automation catches every unpaid installment inside the recovery window', () => {
  assert.equal(deriveAutomatedRecoveryStatus({ daysUntilDue: 3, amountOutstanding: 100 }), 'UPCOMING');
  assert.equal(deriveAutomatedRecoveryStatus({ daysUntilDue: 1, amountOutstanding: 100 }), 'UPCOMING');
  assert.equal(deriveAutomatedRecoveryStatus({ daysUntilDue: 0, amountOutstanding: 100 }), 'DUE');
  assert.equal(deriveAutomatedRecoveryStatus({ daysUntilDue: -1, amountOutstanding: 100 }), 'OVERDUE');
  assert.equal(deriveAutomatedRecoveryStatus({ daysUntilDue: -7, amountOutstanding: 100 }), 'ESCALATED_LEGAL');
});

test('a full payment resolves an existing recovery or legal case', () => {
  assert.equal(deriveAutomatedRecoveryStatus({ currentStatus: 'DEMAND_ISSUED', daysUntilDue: -20, amountOutstanding: 0 }), 'RESOLVED');
});

test('promise-to-pay is preserved until expiry and then becomes broken', () => {
  const now = new Date('2026-08-04T12:00:00Z');
  assert.equal(deriveAutomatedRecoveryStatus({ currentStatus: 'PROMISE_TO_PAY', daysUntilDue: -10, amountOutstanding: 50, promiseDueAt: new Date('2026-08-05T12:00:00Z'), now }), 'PROMISE_TO_PAY');
  assert.equal(deriveAutomatedRecoveryStatus({ currentStatus: 'PROMISE_TO_PAY', daysUntilDue: -10, amountOutstanding: 50, promiseDueAt: new Date('2026-08-03T12:00:00Z'), now }), 'BROKEN_PROMISE');
});

test('operational roles can perform only their workflow transitions', () => {
  assert.equal(canTransitionRecoveryStatus('OVERDUE', 'PROMISE_TO_PAY', 'RECOVERY'), true);
  assert.equal(canTransitionRecoveryStatus('OVERDUE', 'DEMAND_ISSUED', 'RECOVERY'), false);
  assert.equal(canTransitionRecoveryStatus('ESCALATED_LEGAL', 'NOTICE_PREPARATION', 'LEGAL'), true);
  assert.equal(canTransitionRecoveryStatus('UPCOMING', 'NOTICE_PREPARATION', 'LEGAL'), false);
});
