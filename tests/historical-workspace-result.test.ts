import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { HistoricalWorkspaceError, historicalWorkspaceResult } from '../src/lib/server/historical-workspace-result';

test('workspace creation returns a plain success result', async () => {
  assert.deepEqual(await historicalWorkspaceResult(async () => ({ importId: 'new-workspace' })), { success: true, data: { importId: 'new-workspace' } });
});

test('duplicate customer errors survive production error redaction as plain data', async () => {
  const result = await historicalWorkspaceResult(async () => { throw new HistoricalWorkspaceError('DUPLICATE_CUSTOMER', 'Choose the existing account.', 'existing-user'); });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: false, code: 'DUPLICATE_CUSTOMER', message: 'Choose the existing account.', matchingUserId: 'existing-user' });
});

test('closed imports and deleted customers return actionable expected errors', async () => {
  for (const [code, message] of [['IMPORTS_CLOSED', 'Re-enable imports.'], ['CUSTOMER_NOT_FOUND', 'Refresh and select another account.']]) {
    const result = await historicalWorkspaceResult(async () => { throw new HistoricalWorkspaceError(code, message); });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.message, message);
  }
});

test('invalid input uses friendly field instructions rather than schema diagnostics', async () => {
  const result = await historicalWorkspaceResult(async () => z.object({ partyName: z.string().min(2) }).parse({ partyName: '' }));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.code, 'INVALID_INPUT');
    assert.match(result.message, /full name or organisation name/);
  }
});

test('expired sessions, permissions and connectivity errors give appropriate next steps', async () => {
  for (const [status, expected] of [[401, /Sign in again/], [403, /administrator account/], [503, /retry/]] as const) {
    const result = await historicalWorkspaceResult(async () => { throw Object.assign(new Error('Internal verification detail'), { status }); });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.message, expected);
      assert.doesNotMatch(result.message, /Internal verification detail/);
    }
  }
});

test('unexpected SDK errors expose only a support reference and no internal message', async (context) => {
  const log = context.mock.method(console, 'error', () => {});
  const result = await historicalWorkspaceResult(async () => { throw new Error('private credential and customer details'); });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.code, 'INTERNAL_ERROR');
    assert.match(result.message, /reference [a-f0-9-]{36}/);
    assert.doesNotMatch(result.message, /private credential/);
  }
  assert.equal(log.mock.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(log.mock.calls[0].arguments), /private credential/);
});
