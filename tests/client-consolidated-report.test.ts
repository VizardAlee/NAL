import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientConsolidatedReport } from '../src/lib/client-consolidated-report';
import type { Deal, Repayment } from '../src/lib/types';

const timestamp = (date: Date) => ({
  toDate: () => date,
  toMillis: () => date.getTime(),
}) as Deal['createdAt'];

function deal(id: string, status: Deal['status'] = 'Active'): Deal {
  return {
    id,
    dealName: `Deal ${id}`,
    clientId: 'client',
    clientName: 'Client',
    principal: 1_000,
    profitRate: 20,
    durationValue: 2,
    durationUnit: 'Months',
    repaymentType: 'Equal Installments',
    repaymentFrequency: 'Monthly',
    status,
    createdAt: timestamp(new Date(2026, 0, 1)),
    startDate: timestamp(new Date(2026, 0, 1)),
  } as Deal;
}

function repayment(overrides: Partial<Repayment>): Repayment {
  return {
    id: 'repayment',
    clientId: 'client',
    amount: 600,
    status: 'Approved',
    installmentNumber: 1,
    ...overrides,
  } as Repayment;
}

test('consolidated report includes every active deal and excludes closed deals', () => {
  const report = buildClientConsolidatedReport(
    [deal('older-active'), deal('newer-active'), deal('completed', 'Completed')],
    [repayment({ dealId: 'older-active' })],
    new Date(2026, 1, 15)
  );

  assert.equal(report.activeDealCount, 2);
  assert.deepEqual(report.deals.map((item) => item.dealId), ['older-active', 'newer-active']);
  assert.equal(report.activePrincipal, 2_000);
  assert.equal(report.totalScheduled, 2_400);
  assert.equal(report.confirmed, 600);
  assert.equal(report.outstanding, 1_800);
  assert.equal(report.progressPercent, 25);
  assert.equal(report.overdueAmount, 600);
  assert.equal(report.overdueInstallments, 1);
  assert.equal(report.nextPayment?.dealId, 'older-active');
  assert.equal(report.nextPayment?.amount, 600);
});

test('a lodged repayment is reported as pending and does not appear overdue while awaiting approval', () => {
  const report = buildClientConsolidatedReport(
    [deal('active')],
    [repayment({ dealId: 'active', status: 'Pending' })],
    new Date(2026, 1, 15)
  );

  assert.equal(report.pending, 600);
  assert.equal(report.confirmed, 0);
  assert.equal(report.outstanding, 1_200);
  assert.equal(report.overdueAmount, 0);
  assert.equal(report.overdueInstallments, 0);
});
