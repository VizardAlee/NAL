import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { buildMurabahaClauses, murabahaDefaultPeriod, type MurabahaAgreementModel } from '../src/lib/agreements/murabaha';
import { buildMurabahaAgreementPdf } from '../src/lib/agreements/murabaha-pdf';

const agreement: MurabahaAgreementModel = {
  type: 'MURABAHA_SALE', version: '1.0', agreementId: 'NAL-MUR-DEAL1', dealId: 'deal1',
  agreementDate: '2026-07-30T00:00:00.000Z',
  client: { id: 'client1', name: 'Muhammad Salisu', address: 'Kano State', email: 'client@example.com', phoneNumber: '08000000000' },
  guarantor: { name: 'Sample Guarantor', address: 'Kano State', phoneNumber: '08000000001', occupation: 'Trader' },
  company: {
    name: 'NAL GENERAL MERCHANT LTD', rcNumber: '9374407', address: 'Kano State', email: 'info@nalgm.com', website: 'nalgm.com', phoneNumbers: '08000000000',
    account: { accountName: 'NAL General Merchant Ltd', accountNumber: '0513848871', bankName: 'Sterling Bank' },
  },
  deal: {
    name: 'Solar equipment', assetDescription: 'Lithium battery, hybrid inverter and solar panels',
    costPrice: 1_050_000, profitRate: 50, profit: 525_000, contractPrice: 1_575_000,
    durationValue: 8, durationUnit: 'Months', repaymentFrequency: 'Daily', installmentCount: 2,
    installmentMinimum: 787_500, installmentMaximum: 787_500, managementFeeRate: 6,
    managementFeeAmount: 63_000, wakalahGranted: false,
    schedule: [
      { installment: 1, dueDate: '2026-07-31T00:00:00.000Z', openingBalance: 1_575_000, profit: 262_500, principal: 525_000, payment: 787_500, closingBalance: 787_500 },
      { installment: 2, dueDate: '2026-08-01T00:00:00.000Z', openingBalance: 787_500, profit: 262_500, principal: 525_000, payment: 787_500, closingBalance: 0 },
    ],
  },
  missingFields: [],
};

test('Murabaha clauses disclose the fixed cost, profit, contract price and charity-only penalty', () => {
  const clauses = buildMurabahaClauses(agreement);
  assert.equal(clauses.length, 14);
  assert.match(clauses[0].paragraphs.join(' '), /₦1,050,000\.00/);
  assert.match(clauses[0].paragraphs.join(' '), /₦525,000\.00/);
  assert.match(clauses[0].paragraphs.join(' '), /₦1,575,000\.00/);
  assert.match(clauses[7].paragraphs.join(' '), /solely as a deterrent and not as income or profit/i);
});

test('Murabaha clause 6 follows the agreed repayment frequency', () => {
  const cases = [
    ['Daily', 'one (1) calendar day'],
    ['Weekly', 'seven (7) calendar days'],
    ['Fortnightly', 'fourteen (14) calendar days'],
    ['Monthly', 'thirty (30) calendar days'],
  ] as const;

  for (const [repaymentFrequency, expectedPeriod] of cases) {
    const model = {
      ...agreement,
      deal: { ...agreement.deal, repaymentFrequency },
    };
    const clause6 = buildMurabahaClauses(model)[5].paragraphs.join(' ');
    assert.match(clause6, new RegExp(expectedPeriod.replace(/[()]/g, '\\$&')));
    assert.match(clause6, new RegExp(`${repaymentFrequency.toLowerCase()} repayment frequency`, 'i'));
    assert.equal(murabahaDefaultPeriod(repaymentFrequency), expectedPeriod);
  }
});

test('Murabaha clause 8 remains the same for every repayment frequency', () => {
  const frequencies = ['Daily', 'Weekly', 'Fortnightly', 'Monthly'];
  const clause8Versions = frequencies.map((repaymentFrequency) => buildMurabahaClauses({
    ...agreement,
    deal: { ...agreement.deal, repaymentFrequency },
  })[7]);

  clause8Versions.forEach((clause) => assert.deepEqual(clause, clause8Versions[0]));
  assert.match(clause8Versions[0].paragraphs.join(' '), /more than thirty \(30\) days/);
  assert.match(clause8Versions[0].paragraphs.join(' '), /1% per month/);
});

test('Murabaha PDF includes the attached repayment schedule as additional pages', async () => {
  const bytes = await buildMurabahaAgreementPdf(agreement);
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF');
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() >= 2);
});
