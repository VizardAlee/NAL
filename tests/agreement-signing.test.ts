import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementEnvelopeId, calculateSigningStatus, REQUIRED_SIGNER_ROLES } from '../src/lib/agreements/signing';

test('each agreement requires the intended parties, witnesses, and NAL signatories', () => {
  assert.deepEqual(REQUIRED_SIGNER_ROLES.MUDARABA, ['INVESTOR', 'WITNESS_1', 'WITNESS_2', 'NAL_SIGNATORY_1', 'NAL_SIGNATORY_2']);
  assert.deepEqual(REQUIRED_SIGNER_ROLES.WAKALAH, ['CLIENT', 'WITNESS', 'NAL_SIGNATORY_1', 'NAL_SIGNATORY_2']);
  assert.deepEqual(REQUIRED_SIGNER_ROLES.KAFAALAH, ['GUARANTOR', 'WITNESS', 'NAL_AUTHORIZED_SIGNATORY']);
});

test('Mudaraba cannot advance to NAL until both investor witnesses sign', () => {
  const roles = REQUIRED_SIGNER_ROLES.MUDARABA;
  assert.equal(calculateSigningStatus(roles, ['INVESTOR']), 'AWAITING_SIGNATURES');
  assert.equal(calculateSigningStatus(roles, ['INVESTOR', 'WITNESS_1']), 'AWAITING_SIGNATURES');
  assert.equal(calculateSigningStatus(roles, ['INVESTOR', 'WITNESS_1', 'WITNESS_2']), 'AWAITING_COMPANY');
  assert.equal(calculateSigningStatus(roles, roles), 'EXECUTED');
});

test('signing status advances only after the required roles are present', () => {
  const roles = REQUIRED_SIGNER_ROLES.WAKALAH;
  assert.equal(calculateSigningStatus(roles, []), 'AWAITING_SIGNATURES');
  assert.equal(calculateSigningStatus(roles, ['CLIENT']), 'AWAITING_SIGNATURES');
  assert.equal(calculateSigningStatus(roles, ['CLIENT', 'WITNESS']), 'AWAITING_COMPANY');
  assert.equal(calculateSigningStatus(roles, ['CLIENT', 'WITNESS', 'NAL_SIGNATORY_1']), 'AWAITING_COMPANY');
  assert.equal(calculateSigningStatus(roles, roles), 'EXECUTED');
});

test('envelope ids are deterministic per type and source', () => {
  assert.equal(agreementEnvelopeId('KAFAALAH', 'deal-123'), 'kafaalah_deal-123');
});
