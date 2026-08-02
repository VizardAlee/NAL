import assert from 'node:assert/strict';
import test from 'node:test';
import { agreementVerificationUrl, buildAgreementVerificationQr } from '../src/lib/agreements/verification-qr';
import type { AgreementSigningState } from '../src/lib/agreements/signing';

const fingerprint = 'a'.repeat(64);

test('executed agreements receive an official scannable verification QR code', async () => {
  const signing: AgreementSigningState = {
    envelopeId: 'kafaalah_deal-1',
    agreementType: 'KAFAALAH',
    sourceId: 'deal-1',
    agreementReference: 'NAL-KAF-DEAL-1',
    documentVersion: '1.0',
    documentHash: 'b'.repeat(64),
    finalDocumentHash: fingerprint,
    status: 'EXECUTED',
    requiredRoles: ['GUARANTOR', 'WITNESS', 'NAL_AUTHORIZED_SIGNATORY'],
    signedRoles: ['GUARANTOR', 'WITNESS', 'NAL_AUTHORIZED_SIGNATORY'],
    signatures: {},
    invites: [],
    startedAt: '2026-08-02T10:00:00.000Z',
    executedAt: '2026-08-02T11:00:00.000Z',
  };

  const result = await buildAgreementVerificationQr(signing);
  assert.ok(result);
  assert.equal(result.reference, fingerprint);
  assert.match(result.url, /^https?:\/\//);
  assert.ok(result.url.endsWith(`/verify/${fingerprint}`));
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.ok(result.dataUrl.length > 1_000);
});

test('draft agreements never receive an authenticity QR code', async () => {
  const draft = {
    status: 'AWAITING_COMPANY',
    finalDocumentHash: undefined,
  } as AgreementSigningState;
  assert.equal(await buildAgreementVerificationQr(draft), null);
});

test('verification URLs use the full unguessable envelope fingerprint', () => {
  assert.ok(agreementVerificationUrl(fingerprint).endsWith(`/verify/${fingerprint}`));
});
