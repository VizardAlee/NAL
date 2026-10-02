import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutomationAuthorized, normalizeAutomationSecret } from '../src/lib/server/automation-auth';

test('automation normalizes surrounding whitespace without weakening the bearer check', () => {
  assert.equal(normalizeAutomationSecret('  sample-token\r\n'), 'sample-token');
  assert.equal(isAutomationAuthorized('Bearer sample-token', ' sample-token\n'), true);
  assert.equal(isAutomationAuthorized('Bearer wrong-token', 'sample-token'), false);
  assert.equal(isAutomationAuthorized(null, 'sample-token'), false);
  assert.equal(isAutomationAuthorized('sample-token', 'sample-token'), false);
  assert.equal(isAutomationAuthorized('bearer sample-token', 'sample-token'), false);
  assert.equal(isAutomationAuthorized('Bearer sample-token-other', 'sample-token'), false);
});

test('automation fails closed for missing, blank or internally malformed secrets', () => {
  for (const value of [undefined, '', ' \r\n', 'sample\ntoken', 'sample token']) {
    assert.throws(() => normalizeAutomationSecret(value), /missing or malformed/);
  }
});
