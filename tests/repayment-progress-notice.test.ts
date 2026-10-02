import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRepaymentProgressNotice, normalizeWhatsAppPhone, repaymentProgress } from '../src/lib/repayment-progress-notice';

const schedule = Array.from({ length: 90 }, (_, index) => ({ installment: index + 1, dueDate: new Date(Date.UTC(2026, 7, 3 + index)), payment: 25118.75, principal: 20000, interest: 5118.75, balance: 0 }));
const allocations = [...schedule.slice(0, 30).map(row => ({ installmentNumber: row.installment, amount: row.payment, principalApplied: row.principal, interestApplied: row.interest })), { installmentNumber: 31, amount: 10, principalApplied: 8, interestApplied: 2 }];
const base = { id: 'deal', name: 'Murabaha facility', financingMode: 'Murabaha', frequency: 'Daily', startDate: schedule[0].dueDate, schedule, now: new Date('2026-09-03T15:00:00Z'), repayments: [{ status: 'Approved', amount: 753572.5, allocations }, { status: 'Pending', amount: 325392.5, installmentNumber: 31 }] };
test('progress notice calculates the supplied example from allocations, not its text', () => {
  const progress = repaymentProgress(base);
  assert.equal(progress.amountPaid, 753572.5);
  assert.equal(progress.expectedPaid, 803800);
  assert.equal(progress.shortfall, 50227.5);
  assert.equal(progress.dailyPaymentEquivalentsBehind, 2);
  assert.equal(progress.oldestOverdueDays, 1);
  assert.deepEqual(progress.reportingPeriod, { number: 2, start: '2026-09-02', end: '2026-10-01' });
});
test('daily progress notices are not eligible before 4pm Lagos', () => {
  assert.equal(repaymentProgress({ ...base, now: new Date('2026-09-03T14:59:00Z') }).due, false);
  assert.equal(repaymentProgress(base).due, true);
});
test('weekly and monthly reminders use actual schedule lead days, not 30-day reporting blocks', () => {
  const row = { ...schedule[0], payment: 100, dueDate: new Date('2026-09-06T00:00:00Z') };
  assert.equal(repaymentProgress({ ...base, frequency: 'Monthly', schedule: [row], repayments: [] }).due, true);
  const weekly = repaymentProgress({ ...base, frequency: 'Weekly', schedule: [row], repayments: [], now: new Date('2026-09-05T15:00:00Z') });
  assert.equal(weekly.due, true); assert.equal(weekly.reportingPeriod, null);
  assert.equal(repaymentProgress({ ...base, frequency: 'Weekly', schedule: [row], repayments: [] }).due, false);
});
test('future allocations reduce remaining balance without hiding unpaid due installments', () => {
  const progress = repaymentProgress({ ...base, repayments: [{ status: 'Approved', amount: 25118.75, allocations: [{ ...allocations[0], installmentNumber: 40 }] }] });
  assert.equal(progress.advancePaid, 25118.75);
  assert.equal(progress.shortfall, 803800);
  assert.equal(progress.remaining, 90 * 25118.75 - 25118.75);
});
test('ambiguous or over-allocated financial data fails closed', () => {
  assert.throws(() => repaymentProgress({ ...base, repayments: [{ status: 'Approved', amount: 100 }] }), /allocations/);
  assert.throws(() => repaymentProgress({ ...base, repayments: [{ status: 'Approved', amount: 30000, installmentNumber: 1 }] }), /over-allocated/);
});
test('consolidated notices sanitize names, omit invented additional payments and aggregate in kobo', () => {
  const deal = repaymentProgress(base);
  const notice = buildRepaymentProgressNotice({ clientName: 'Client\n*PAY ELSEWHERE*', asOf: '2026-09-03', deals: [deal, { ...deal, id: 'second' }], account: { bankName: 'Bank', accountName: 'NAL', accountNumber: '0513848871' } });
  assert.equal(notice.amountPaid, 1507145);
  assert.equal(notice.shortfall, 100455);
  assert.ok(notice.text.includes('CONSOLIDATED POSITION'));
  assert.ok(!notice.text.includes('previous sent notice'));
  assert.ok(!notice.text.includes('Client\n*PAY'));
});
test('Nigerian WhatsApp phone normalization accepts local/international formats, not malformed numbers', () => {
  assert.equal(normalizeWhatsAppPhone('0803 206 5880'), '2348032065880');
  assert.equal(normalizeWhatsAppPhone('+234 (0) 803 206 5880'), '2348032065880');
  assert.throws(() => normalizeWhatsAppPhone('not a phone'), /valid Nigerian/);
});
