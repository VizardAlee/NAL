import assert from 'node:assert/strict';
import test from 'node:test';
import { planRepaymentAllocations, repaymentAmountForInstallment, remainingScheduledAmount } from '../src/lib/repayment-allocation';

const schedule = [1, 2, 3].map((installment) => ({
  installment,
  dueDate: new Date(`2026-0${installment}-01T00:00:00Z`),
  payment: 125,
  principal: 100,
  interest: 25,
  balance: (3 - installment) * 100,
}));

test('overpayment clears the current installment and rolls into future installments', () => {
  const allocations = planRepaymentAllocations({ amount: 300, startingInstallment: 1, schedule, approvedRepayments: [] });
  assert.deepEqual(allocations.map((item) => [item.installmentNumber, item.amount]), [[1, 125], [2, 125], [3, 50]]);
  assert.equal(allocations.reduce((sum, item) => sum + item.principalApplied, 0), 240);
  assert.equal(allocations.reduce((sum, item) => sum + item.interestApplied, 0), 60);
});

test('allocation skips amounts already paid and never exceeds the deal balance', () => {
  const approved = [{ status: 'Approved', installmentNumber: 1, amount: 100, principalApplied: 80, interestApplied: 20 }];
  const allocations = planRepaymentAllocations({ amount: 150, startingInstallment: 1, schedule, approvedRepayments: approved });
  assert.deepEqual(allocations.map((item) => [item.installmentNumber, item.amount]), [[1, 25], [2, 125]]);
  assert.equal(remainingScheduledAmount(schedule, approved), 275);
  assert.throws(() => planRepaymentAllocations({ amount: 276, startingInstallment: 1, schedule, approvedRepayments: approved }), /remaining deal balance/);
});

test('allocation-aware records report the amount paid against each future installment', () => {
  const repayment = {
    amount: 250,
    installmentNumber: 1,
    allocations: planRepaymentAllocations({ amount: 250, startingInstallment: 1, schedule, approvedRepayments: [] }),
  };
  assert.equal(repaymentAmountForInstallment(repayment, 1), 125);
  assert.equal(repaymentAmountForInstallment(repayment, 2), 125);
  assert.equal(repaymentAmountForInstallment(repayment, 3), 0);
});
