import assert from 'node:assert/strict';
import test from 'node:test';
import { selectClientDashboardDeal } from '../src/lib/client-dashboard-deal';

const timestamp = (millis: number) => ({ toMillis: () => millis });

test('the newest active deal is displayed when several deals are active', () => {
  const selected = selectClientDashboardDeal([
    { id: 'older-active', status: 'Active', createdAt: timestamp(100) },
    { id: 'latest-completed', status: 'Completed', createdAt: timestamp(300) },
    { id: 'newer-active', status: 'Active', createdAt: timestamp(200) },
  ]);

  assert.equal(selected?.id, 'newer-active');
});

test('the only active deal is displayed even when a newer inactive deal exists', () => {
  const selected = selectClientDashboardDeal([
    { id: 'older-active', status: 'Active', createdAt: timestamp(100) },
    { id: 'latest-terminated', status: 'Terminated', createdAt: timestamp(300) },
    { id: 'completed', status: 'Completed', createdAt: timestamp(200) },
  ]);

  assert.equal(selected?.id, 'older-active');
});

test('the newest deal is displayed when no deal is active', () => {
  const selected = selectClientDashboardDeal([
    { id: 'older-completed', status: 'Completed', createdAt: timestamp(100) },
    { id: 'latest-terminated', status: 'Terminated', createdAt: timestamp(300) },
  ]);

  assert.equal(selected?.id, 'latest-terminated');
});
