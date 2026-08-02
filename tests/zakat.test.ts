import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateZakatAmount,
  getNextZakatAssessmentDate,
  isZakatDue,
} from '../src/lib/zakat';

test('Zakat is due on the Gregorian anniversary, not after a fixed 365-day approximation', () => {
  const firstDepositDate = new Date('2024-03-01T09:30:00Z');
  assert.equal(isZakatDue({ firstDepositDate, now: new Date('2025-03-01T09:29:59Z') }), false);
  assert.equal(isZakatDue({ firstDepositDate, now: new Date('2025-03-01T09:30:00Z') }), true);
});

test('the last successful payment resets the annual assessment date', () => {
  assert.equal(isZakatDue({
    firstDepositDate: new Date('2020-01-01T00:00:00Z'),
    lastPaymentDate: new Date('2025-07-20T00:00:00Z'),
    now: new Date('2026-07-19T23:59:59Z'),
  }), false);
  assert.equal(isZakatDue({
    firstDepositDate: new Date('2020-01-01T00:00:00Z'),
    lastPaymentDate: new Date('2025-07-20T00:00:00Z'),
    now: new Date('2026-07-20T00:00:00Z'),
  }), true);
});

test('a recorded assessment takes precedence over an older payment', () => {
  assert.equal(isZakatDue({
    firstDepositDate: new Date('2020-01-01T00:00:00Z'),
    lastPaymentDate: new Date('2024-01-01T00:00:00Z'),
    lastAssessmentDate: new Date('2025-08-01T00:00:00Z'),
    now: new Date('2026-07-31T23:59:59Z'),
  }), false);
});

test('29 February assessments fall on 28 February in non-leap years', () => {
  assert.equal(
    getNextZakatAssessmentDate(new Date('2024-02-29T12:00:00Z')).toISOString(),
    '2025-02-28T12:00:00.000Z'
  );
});

test('Zakat calculation enforces Nisab and rounds to kobo', () => {
  assert.equal(calculateZakatAmount(999_999.99, 1_000_000), 0);
  assert.equal(calculateZakatAmount(1_000_000, 1_000_000), 25_000);
  assert.equal(calculateZakatAmount(1_234_567.89, 1_000_000), 30_864.2);
  assert.equal(calculateZakatAmount(1_000_000, 0), 0);
});
