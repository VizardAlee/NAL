import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commissionKobo, kobo, netClearedKobo, replenishmentTarget } from '../src/lib/marketing-fund';

test('5% agreed profit accrues in kobo with deterministic half-up rounding', () => {
  assert.equal(commissionKobo(1000000),5000000);
  assert.equal(commissionKobo(0.1),1);
  assert.equal(commissionKobo(0),0);
  for (const value of [-1,NaN,Infinity,Number.MAX_VALUE]) assert.throws(()=>kobo(value));
});
test('cumulative receipt ratio caps at funded commission and returns final residual', () => {
  const funded=kobo(50000), total=kobo(3000000);
  assert.equal(replenishmentTarget(funded,kobo(300000),total),kobo(5000));
  const targets=[1,2,3].map(n=>replenishmentTarget(funded,kobo(n*1000000),total));
  assert.deepEqual(targets,[1666667,3333333,5000000]);
  assert.deepEqual([targets[0],targets[1]-targets[0],targets[2]-targets[1]],[1666667,1666666,1666667]);
  assert.equal(replenishmentTarget(funded,kobo(4000000),total),funded);
});
test('partial funding, later funding, refunds and reversals use net cleared basis',()=>{
  assert.equal(replenishmentTarget(kobo(20000),kobo(300000),kobo(3000000)),kobo(2000));
  assert.equal(replenishmentTarget(kobo(50000),kobo(300000),kobo(3000000)),kobo(5000));
  const receipts=[{status:'Approved',amount:300000,refundedAmount:150000},{status:'Reversed',amount:100000},{status:'Pending',amount:100000},{status:'Refunded',amount:100000}];
  assert.equal(netClearedKobo(receipts),kobo(150000));
  assert.equal(replenishmentTarget(kobo(50000),netClearedKobo(receipts),kobo(3000000)),kobo(2500));
});
