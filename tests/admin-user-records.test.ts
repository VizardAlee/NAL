import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminUserRecordSchema, adminUserUploadSchema } from '../src/lib/server/admin-user-records';

const base = { userId: 'client', name: 'Test Client', reason: 'Correct verified evidence' };
test('admin user updates validate identifiers and reject privilege-bearing fields', () => {
  assert.equal(adminUserRecordSchema.safeParse(base).success, true);
  for (const extra of [{ role: 'Admin' }, { email: 'changed@example.com' }, { bvn: '123' }, { bankAccountNumber: '123' }, { tin: '123' }, { userId: '../client' }, { revision: -1 }]) {
    assert.equal(adminUserRecordSchema.safeParse({ ...base, ...extra }).success, false);
  }
});
test('government ID needs a valid selected type and audit reason is mandatory', () => {
  assert.equal(adminUserRecordSchema.safeParse({ ...base, governmentIdType: 'NIN', governmentIdNumber: '12345678901' }).success, true);
  assert.equal(adminUserRecordSchema.safeParse({ ...base, governmentIdNumber: '12345678901' }).success, false);
  assert.equal(adminUserRecordSchema.safeParse({ ...base, reason: '' }).success, false);
});
test('upload metadata binds replacements to a validated user and document kind', () => {
  assert.equal(adminUserUploadSchema.safeParse({ userId: 'client', kind: 'GOVERNMENT_ID', reason: 'Replace outdated ID' }).success, true);
  assert.equal(adminUserUploadSchema.safeParse({ userId: 'client', kind: 'AGREEMENT', reason: 'Replace outdated ID' }).success, false);
  assert.equal(adminUserUploadSchema.safeParse({ userId: 'client', kind: 'GOVERNMENT_ID', reason: 'Replace outdated ID', replaceDocumentId: '../other' }).success, false);
});
