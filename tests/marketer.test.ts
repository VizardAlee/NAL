import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalReferralCode } from '../src/lib/marketer';
import { hasPersona } from '../src/lib/access-control';
import { assertAutomationJobsSucceeded } from '../src/lib/automation-result';

test('legacy and Admin+MARKETER profiles keep their persona without needing a referral code', () => {
  for (const profile of [{ role: 'Marketer' as const }, { role: 'Admin' as const, accessRole: 'ADMIN' as const, personas: ['MARKETER' as const] }]) {
    assert.equal(hasPersona(profile, 'MARKETER'), true);
    assert.equal(historicalReferralCode(profile), null);
  }
  assert.doesNotThrow(() => assertAutomationJobsSucceeded({ marketerRating: { errors: 0 }, recovery: { errors: 0 } }));
  assert.throws(() => assertAutomationJobsSucceeded({ marketerRating: { errors: 0 }, ownerProfit: { errors: 1 } }), /ownerProfit/);
});

test('only usable historical keys are queried, without changing exact-match attribution', () => {
  for (const referralCode of [undefined, null, '', '  ', 123, {}]) assert.equal(historicalReferralCode({ referralCode }), null);
  assert.equal(historicalReferralCode({ referralCode: 'MARK-OLD-1234' }), 'MARK-OLD-1234');
  assert.equal(historicalReferralCode({ referralCode: ' legacy-code ' }), ' legacy-code ');
});
