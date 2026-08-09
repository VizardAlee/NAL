import assert from 'node:assert/strict';
import test from 'node:test';
import { isRepaymentReminderDue, repaymentReminderLeadDays } from '../src/lib/repayment-reminders';

test('monthly reminders are sent three Lagos calendar days before payment', () => {
  assert.equal(repaymentReminderLeadDays('Monthly'), 3);
  assert.equal(isRepaymentReminderDue({
    frequency: 'Monthly', dueDate: new Date('2026-08-13T00:00:00Z'), now: new Date('2026-08-10T15:00:00Z'),
  }), true);
});

test('weekly reminders are sent one day before payment', () => {
  assert.equal(isRepaymentReminderDue({
    frequency: 'Weekly', dueDate: new Date('2026-08-11T08:00:00Z'), now: new Date('2026-08-10T15:00:00Z'),
  }), true);
});

test('daily reminders are held until 4pm Lagos on the due date', () => {
  const dueDate = new Date('2026-08-10T20:00:00Z');
  assert.equal(isRepaymentReminderDue({ frequency: 'Daily', dueDate, now: new Date('2026-08-10T14:59:00Z') }), false);
  assert.equal(isRepaymentReminderDue({ frequency: 'Daily', dueDate, now: new Date('2026-08-10T15:00:00Z') }), true);
});
