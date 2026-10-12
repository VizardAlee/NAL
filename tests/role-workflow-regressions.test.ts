import { recordedInvestmentCapitalLock } from '../src/lib/investment-maturity';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPortal, getAccessiblePortals, getDefaultRouteForUser, hasPersona, isPrimaryPortal } from '../src/lib/access-control';
import { assertAutomationJobsSucceeded } from '../src/lib/automation-result';

test('explicit empty modern personas revoke legacy operational access and do not fall back to client', () => {
  for (const role of ['Investor','Client','Legal','Recovery','Marketer'] as const) {
    for (const profile of [{role,accessRole:'USER' as const,personas:[]},{role,personas:[]}]) {
      assert.deepEqual(getAccessiblePortals(profile), []);
      assert.equal(getDefaultRouteForUser(profile), '/access-pending');
      for(const portal of ['investor','client','legal','recovery','marketer'] as const) assert.equal(canAccessPortal(profile,portal),false);
    }
  }
});
test('genuine legacy profiles retain their role and migrated profiles use their assigned personas', () => {
  assert.equal(hasPersona({role:'Investor'},'INVESTOR'),true);
  assert.equal(canAccessPortal({role:'Client'},'client'),true);
  assert.equal(hasPersona({role:'Client',accessRole:'USER',personas:['INVESTOR']},'CLIENT'),false);
  assert.equal(hasPersona({role:'Client',accessRole:'USER',personas:['INVESTOR']},'INVESTOR'),true);
});
test('any subjob error prevents a healthy automation result; disabled/skipped zero-error jobs are valid', () => {
  assert.throws(()=>assertAutomationJobsSucceeded({recovery:{errors:0},marketerRating:{errors:1}}),/marketerRating/);
  assert.throws(()=>assertAutomationJobsSucceeded({ownerProfit:{errors:2}}),/ownerProfit/);
  assert.doesNotThrow(()=>assertAutomationJobsSucceeded({skipped:{errors:0},healthy:{}}));
});

test('legacy role arrays remain compatible and invalid portals cannot enter the route map', () => {
  assert.equal(hasPersona({role:'Client',roles:['Investor']},'CLIENT'),true);
  assert.equal(hasPersona({roles:['Investor']},'INVESTOR'),true);
  assert.equal(isPrimaryPortal('constructor'),false);
  assert.equal(isPrimaryPortal('__proto__'),false);
  assert.deepEqual(getAccessiblePortals({role:'Client',personas:null}),[]);
});

test('recorded capital maturity retains the full inclusive Nigeria day, including leap day', () => {
  const lock=recordedInvestmentCapitalLock('2026-10-12T12:00:00.000Z');
  assert.equal(lock.toISOString(),'2026-10-12T23:00:00.000Z');
  assert.ok(new Date('2026-10-12T20:00:00Z')<lock);
  assert.equal(recordedInvestmentCapitalLock('2028-02-29').toISOString(),'2028-02-29T23:00:00.000Z');
  for(const invalid of ['',undefined,'2026-02-30','invalid']) assert.throws(()=>recordedInvestmentCapitalLock(invalid),/valid maturity date/);
});
