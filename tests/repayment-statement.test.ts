import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRepaymentStatementRows } from '../src/lib/repayment-statement';

const schedule = [
  { installment: 1, dueDate: new Date('2026-01-01T00:00:00Z'), principal: 100, interest: 25, payment: 125, balance: 200 },
  { installment: 2, dueDate: new Date('2026-02-01T00:00:00Z'), principal: 100, interest: 25, payment: 125, balance: 100 },
  { installment: 3, dueDate: new Date('2026-03-01T00:00:00Z'), principal: 100, interest: 25, payment: 125, balance: 0 },
];

test('printable repayment rows include the complete schedule and contractual balances', () => {
  const rows = buildRepaymentStatementRows(schedule, [], new Date('2025-01-01T00:00:00Z'));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => [row.openingBalance, row.closingBalance]), [
    [375, 250],
    [250, 125],
    [125, 0],
  ]);
});

test('a lodged repayment remains awaiting approval until an admin approves it', () => {
  const pending = buildRepaymentStatementRows(schedule, [
    { installmentNumber: 1, amount: 125, status: 'Pending' },
  ], new Date('2026-04-01T00:00:00Z'));
  assert.equal(pending[0].status, 'Awaiting approval');

  const approved = buildRepaymentStatementRows(schedule, [
    { installmentNumber: 1, amount: 125, status: 'Approved' },
  ], new Date('2026-04-01T00:00:00Z'));
  assert.equal(approved[0].status, 'Paid');
});
