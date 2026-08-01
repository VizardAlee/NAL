import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWakalahAgreementPdf } from '../src/lib/agreements/wakalah-pdf';
import { buildWakalahClauses, type WakalahAgreementModel } from '../src/lib/agreements/wakalah';

const agreement: WakalahAgreementModel = {
  type: 'WAKALAH_PROCUREMENT',
  version: '1.0',
  agreementId: 'NAL-WAK-DEAL123',
  dealId: 'deal123',
  agreementDate: '2026-07-30T00:00:00.000Z',
  client: { id: 'client1', name: 'Muhammad Salisu', address: 'No. 4, Bakin Kasuwa, Kano State', email: 'client@example.com', phoneNumber: '08000000000' },
  company: { name: 'NAL GENERAL MERCHANT LTD', rcNumber: '9374407', address: 'Civic Center Road, Kano State', email: 'info@nalgm.com', website: 'nalgm.com', phoneNumbers: '+2348032869067' },
  deal: { name: 'Building Materials', assetDescription: '500 bags of cement', supplierName: 'Approved Cement Limited', principal: 10_000_000, financingMode: 'Murabaha' },
  missingFields: [],
};

test('Wakalah authority is limited to the approved asset and supplier', () => {
  const clauses = buildWakalahClauses(agreement);
  assert.equal(clauses.length, 6);
  assert.match(clauses[0].body, /500 bags of cement/);
  assert.match(clauses[0].body, /Approved Cement Limited/);
  assert.match(clauses[4].body, /limited strictly to the procurement/);
});

test('Wakalah agreement generates a real PDF', async () => {
  const bytes = await buildWakalahAgreementPdf(agreement);
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString(), '%PDF');
});
