import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCompanyTax2026,
  calculateVat2026,
  calculateWhtDeduction2026,
} from '../src/lib/nigeria-tax-2026';

test('2026 small-company status uses the N100m turnover and N250m asset tests', () => {
  const tax = calculateCompanyTax2026({
    turnover: 100_000_000,
    fixedAssets: 250_000_000,
    assessableProfit: 20_000_000,
    totalProfits: 18_000_000,
    auditedNetIncome: 22_000_000,
  });
  assert.equal(tax.qualifiesAsSmallCompany, true);
  assert.equal(tax.companyIncomeTax, 0);
  assert.equal(tax.developmentLevy, 0);
});

test('standard companies pay 30% CIT and 4% development levy', () => {
  const tax = calculateCompanyTax2026({
    turnover: 150_000_000,
    fixedAssets: 10_000_000,
    assessableProfit: 20_000_000,
    totalProfits: 15_000_000,
    auditedNetIncome: 22_000_000,
  });
  assert.equal(tax.companyIncomeTax, 4_500_000);
  assert.equal(tax.developmentLevy, 800_000);
});

test('minimum ETR uses audited net income and applies from N50bn turnover', () => {
  const tax = calculateCompanyTax2026({
    turnover: 50_000_000_000,
    fixedAssets: 1_000_000_000,
    assessableProfit: 1_000_000,
    totalProfits: 1_000_000,
    auditedNetIncome: 10_000_000,
  });
  assert.equal(tax.minimumEtrBenchmark, 1_500_000);
  assert.equal(tax.minimumEtrTopUp, 1_160_000);
});

test('VAT output is automatically calculated at 7.5%', () => {
  const vat = calculateVat2026({
    recordedStandardRatedSupplies: 1_000_000,
    additionalStandardRatedSupplies: 500_000,
    eligibleInputVat: 50_000,
  });
  assert.equal(vat.outputVat, 112_500);
  assert.equal(vat.vatPayable, 62_500);
});

test('WHT applies the 2024 schedule and doubles non-passive rates without a Tax ID', () => {
  const withTin = calculateWhtDeduction2026({
    category: 'PROFESSIONAL_FEES',
    recipientType: 'CORPORATE',
    residence: 'RESIDENT',
    grossAmount: 1_000_000,
    hasTaxId: true,
  });
  const withoutTin = calculateWhtDeduction2026({
    category: 'PROFESSIONAL_FEES',
    recipientType: 'CORPORATE',
    residence: 'RESIDENT',
    grossAmount: 1_000_000,
    hasTaxId: false,
  });
  assert.equal(withTin.amount, 50_000);
  assert.equal(withoutTin.amount, 100_000);
});

test('qualifying small-company payments up to N2m are exempt when supplier has a Tax ID', () => {
  const wht = calculateWhtDeduction2026({
    category: 'OTHER_SERVICES',
    recipientType: 'CORPORATE',
    residence: 'RESIDENT',
    grossAmount: 2_000_000,
    hasTaxId: true,
    payerQualifiesAsSmallCompany: true,
  });
  assert.equal(wht.amount, 0);
});

test('small-company WHT exemption uses the supplier monthly aggregate', () => {
  const wht = calculateWhtDeduction2026({
    category: 'OTHER_SERVICES',
    recipientType: 'CORPORATE',
    residence: 'RESIDENT',
    grossAmount: 1_500_000,
    monthlySupplierTransactionValue: 3_000_000,
    hasTaxId: true,
    payerQualifiesAsSmallCompany: true,
  });
  assert.equal(wht.amount, 30_000);
});
