import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWithholdingTaxPosition } from '../src/lib/tax-calculations';

test('WHT suffered is applied only up to the corporate tax due', () => {
  const position = calculateWithholdingTaxPosition({
    grossCorporateTaxDue: 100_000,
    creditsSuffered: 125_000,
    deductedFromPayments: 0,
    remitted: 0,
  });

  assert.equal(position.creditApplied, 100_000);
  assert.equal(position.creditCarryforward, 25_000);
  assert.equal(position.corporateTaxPayable, 0);
});

test('WHT deducted remains outstanding until it is remitted', () => {
  const position = calculateWithholdingTaxPosition({
    grossCorporateTaxDue: 0,
    creditsSuffered: 0,
    deductedFromPayments: 33_333.335,
    remitted: 10_000,
  });

  assert.equal(position.deductedFromPayments, 33_333.34);
  assert.equal(position.outstanding, 23_333.34);
  assert.equal(position.remittanceExcess, 0);
});

test('excess WHT remittance is not reported as a negative liability', () => {
  const position = calculateWithholdingTaxPosition({
    grossCorporateTaxDue: 0,
    creditsSuffered: 0,
    deductedFromPayments: 20_000,
    remitted: 21_500,
  });

  assert.equal(position.outstanding, 0);
  assert.equal(position.remittanceExcess, 1_500);
});
