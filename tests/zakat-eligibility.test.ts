import assert from 'node:assert/strict';
import test from 'node:test';

import { isZakatApplicable } from '../src/lib/zakat-eligibility';

test('Zakat applies to an explicitly Muslim investor', () => {
  assert.equal(
    isZakatApplicable({
      accessRole: 'USER',
      personas: ['INVESTOR'],
      primaryPortal: 'investor',
      isMuslim: true,
    }),
    true
  );
});

test('Zakat does not apply to a non-Muslim investor', () => {
  assert.equal(
    isZakatApplicable({
      accessRole: 'USER',
      personas: ['INVESTOR'],
      primaryPortal: 'investor',
      isMuslim: false,
    }),
    false
  );
});

test('Zakat does not apply to an unclassified legacy investor', () => {
  assert.equal(
    isZakatApplicable({
      role: 'Investor',
    }),
    false
  );
});

test('Zakat does not apply to a Muslim who is not an investor', () => {
  assert.equal(
    isZakatApplicable({
      accessRole: 'USER',
      personas: ['CLIENT'],
      primaryPortal: 'client',
      isMuslim: true,
    }),
    false
  );
});
