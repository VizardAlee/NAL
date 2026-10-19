import test from 'node:test';
import assert from 'node:assert/strict';
import { automationHealthDisplay } from '../src/lib/automation-health';
const time = (value: string) => ({toMillis:() => Date.parse(value)});
test('automation health distinguishes running, unknown overdue, partial failure and stale success', () => {
  const now = Date.parse('2026-10-19T15:31:00Z');
  assert.equal(automationHealthDisplay(null,now).label,'Unknown');
  assert.equal(automationHealthDisplay({status:'RUNNING',lastStartedAt:time('2026-10-19T15:25:00Z')},now).label,'Running');
  assert.match(automationHealthDisplay({status:'RUNNING',lastStartedAt:time('2026-10-19T15:00:00Z')},now).label,/Overdue/);
  assert.equal(automationHealthDisplay({status:'FAILED',components:{recovery:{status:'SUCCEEDED'},ownerProfit:{status:'FAILED'}}},now).label,'Partial failure');
  assert.equal(automationHealthDisplay({status:'HEALTHY',lastSucceededAt:time('2026-10-18T15:02:00Z')},now).label,'Stale success');
  assert.equal(automationHealthDisplay({status:'HEALTHY',lastSucceededAt:time('2026-10-19T15:02:00Z')},now).label,'Healthy');
  assert.equal(automationHealthDisplay({status:'HEALTHY',lastSucceededAt:time('2026-10-18T15:02:00Z')},Date.parse('2026-10-19T15:20:00Z')).label,'Healthy');
});
