import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMudarabaClauses,
  calculateMaturityDate,
  formatAgreementDate,
  nairaAmountInWords,
  type MudarabaAgreementModel,
} from '../src/lib/agreements/mudaraba';
import { buildMudarabaAgreementPdf } from '../src/lib/agreements/mudaraba-pdf';

const sampleAgreement: MudarabaAgreementModel = {
  type: 'MUDARABA_INVESTMENT',
  version: 'NAL-MUDARABA-2026-01',
  agreementId: 'NAL-MUD-SAMPLE',
  batchId: 'sample',
  agreementDate: '2026-03-23T11:00:00.000Z',
  paymentDate: '2026-03-23T11:00:00.000Z',
  paymentReference: '00043980523032026145048',
  amount: 20_000_000,
  amountInWords: 'Twenty Million Naira Only',
  tenureValue: 36,
  tenureUnit: 'Months',
  termLabel: '36 calendar months',
  maturityDate: '2029-03-22T11:00:00.000Z',
  investor: {
    id: 'investor',
    name: 'Abdulrahman Labaran Nuhu',
    address: 'Kano State',
    email: 'investor@example.com',
    phoneNumber: '+2348000000000',
    isMuslim: true,
    account: { accountName: 'Abdulrahman Labaran Nuhu', accountNumber: '0004438961', bankName: 'Taj Bank' },
  },
  company: {
    name: 'NAL GENERAL MERCHANT LTD',
    rcNumber: '9374407',
    address: 'Kano State',
    email: 'info@nalgm.com',
    website: 'nalgm.com',
    phoneNumbers: '+2348000000000',
    account: { accountName: 'NAL General Merchant', accountNumber: '0511879404', bankName: 'Sterling Bank' },
  },
  missingFields: [],
};

test('agreement amount words match the supplied investment capital', () => {
  assert.equal(nairaAmountInWords(20_000_000), 'Twenty Million Naira Only');
  assert.equal(nairaAmountInWords(1_250.5), 'One Thousand Two Hundred and Fifty Naira and Fifty Kobo Only');
});

test('36 calendar months from 23 March 2026 matures on 22 March 2029', () => {
  const maturity = calculateMaturityDate(new Date('2026-03-23T11:00:00.000Z'), 36, 'Months');
  assert.equal(formatAgreementDate(maturity), '22 March 2029');
});

test('duration and early-termination clauses always use the same computed maturity date', () => {
  const clauses = buildMudarabaClauses(sampleAgreement);
  const duration = clauses.find((clause) => clause.number === 2)?.body;
  const termination = clauses.find((clause) => clause.number === 12)?.body;
  assert.match(duration || '', /22 March 2029/);
  assert.match(termination || '', /22 March 2029/);
  assert.doesNotMatch(termination || '', /12 November 2028/);
});

test('non-Muslim agreements explicitly prohibit Zakat deductions', () => {
  const clauses = buildMudarabaClauses({
    ...sampleAgreement,
    investor: { ...sampleAgreement.investor, isMuslim: false },
  });
  assert.match(clauses.find((clause) => clause.number === 9)?.body || '', /no Zakat shall be deducted/i);
});

test('permitted activities expressly include Mudaraba', () => {
  const permittedActivities = buildMudarabaClauses(sampleAgreement)
    .find((clause) => clause.number === 3)?.body || '';
  assert.match(permittedActivities, /including Murabaha, Mudaraba, Salam/);
});

test('the generated agreement is a real PDF document', async () => {
  const bytes = await buildMudarabaAgreementPdf(sampleAgreement);
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF');
  assert.ok(bytes.length > 5_000);
});
