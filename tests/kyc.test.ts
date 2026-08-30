import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidBvn,
  isValidGovernmentIdNumber,
  isValidNigerianAccountNumber,
  isValidTin,
  maskIdentifier,
} from '../src/lib/kyc';

test('validates supported Nigerian government identifiers', () => {
  assert.equal(isValidGovernmentIdNumber('NIN', '12345678901'), true);
  assert.equal(isValidGovernmentIdNumber('NIN', '12345'), false);
  assert.equal(isValidGovernmentIdNumber('NIGERIAN_PASSPORT', 'A12345678'), true);
  assert.equal(isValidGovernmentIdNumber('NIGERIAN_PASSPORT', '123456789'), false);
  assert.equal(isValidGovernmentIdNumber('DRIVERS_LICENCE', 'ABC-1234567'), true);
  assert.equal(isValidGovernmentIdNumber('VOTERS_CARD', '90F5B7C123456789012'), true);
});

test('validates Nigerian BVN, bank-account and TIN formats', () => {
  assert.equal(isValidBvn('123 456 789 01'), true);
  assert.equal(isValidBvn('1234567890'), false);
  assert.equal(isValidNigerianAccountNumber('0123456789'), true);
  assert.equal(isValidNigerianAccountNumber('01234567890'), false);
  assert.equal(isValidTin('12345678-0001'), true);
  assert.equal(isValidTin('1234'), false);
});

test('masks sensitive identifiers for ordinary profile records', () => {
  assert.equal(maskIdentifier('12345678901'), '*******8901');
  assert.equal(maskIdentifier('A12345678'), '*****5678');
});
