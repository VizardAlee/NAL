import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKafaalahBondPdf } from '../src/lib/agreements/kafaalah-pdf';
import { buildKafaalahClauses, type KafaalahBondModel } from '../src/lib/agreements/kafaalah';
import { hasCompleteGuarantor } from '../src/lib/deals/guarantor';

function model(financingMode: KafaalahBondModel['deal']['financingMode']): KafaalahBondModel {
  return {
    type: 'KAFAALAH_GUARANTEE', version: '1.0', bondId: 'NAL-KAF-DEAL123', dealId: 'deal123',
    bondDate: '2026-07-30T00:00:00.000Z', principalAgreementDate: '2026-07-30T00:00:00.000Z',
    company: { name: 'NAL GENERAL MERCHANT LTD', rcNumber: '9374407', address: 'Civic Center Road, Kano State', email: 'info@nalgm.com', website: 'nalgm.com', phoneNumbers: '+2348032869067' },
    client: { id: 'client1', name: 'Muhammad Salisu', address: 'Yadakwari, Kano State' },
    guarantor: { name: 'Bilya A. Adamu', address: 'Kwana Uku, Kano State', phoneNumber: '08000000000', occupation: 'Trader' },
    deal: { name: 'Materials Financing', principal: 10_000_000, profitRate: 20, financingMode }, missingFields: [],
  };
}

test('Kafaalah bond preserves all twelve source obligations', () => {
  const clauses = buildKafaalahClauses(model('Murabaha'));
  assert.equal(clauses.length, 12);
  assert.match(clauses[1].body, /agreed Murabaha profit/);
  assert.match(clauses[4].body, /continuing guarantee/);
  assert.match(clauses[11].body, /independent legal and financial advice/);
});

test('Kafaalah liability wording follows the deal financing mode', () => {
  assert.match(buildKafaalahClauses(model('Ijara'))[1].body, /rental obligations/);
  assert.match(buildKafaalahClauses(model('Mudaraba'))[1].body, /profit-sharing obligations/);
  assert.doesNotMatch(buildKafaalahClauses(model('Ijara'))[1].body, /Murabaha profit/);
});

test('Kafaalah bond generates a real PDF', async () => {
  const bytes = await buildKafaalahBondPdf(model('Murabaha'));
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), '%PDF');
});

test('a deal cannot proceed without every required guarantor field', () => {
  const complete = { guarantorName: 'Bilya Adamu', guarantorAddress: 'Kano State', guarantorPhoneNumber: '08000000000', guarantorOccupation: 'Trader', guarantorPhotoURL: 'https://example.com/photo.jpg' };
  assert.equal(hasCompleteGuarantor(complete), true);
  assert.equal(hasCompleteGuarantor({ ...complete, guarantorPhotoURL: '' }), false);
  assert.equal(hasCompleteGuarantor({ ...complete, guarantorPhoneNumber: undefined }), false);
});
