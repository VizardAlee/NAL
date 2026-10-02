import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {userGuideTopics,guideLabels,guideStorageKey,parseGuideProgress} from '../src/lib/user-guide';
import type {PrimaryPortal} from '../src/lib/access-control';
const portals:PrimaryPortal[]=['client','investor','admin','owner','legal','recovery','marketer'];
test('every role gets a distinct, complete guide with real section links and all four languages',()=>{
  for(const portal of portals){const topics=userGuideTopics(portal);assert.ok(topics.length>=3);assert.equal(new Set(topics.map(topic=>topic.id)).size,topics.length);for(const topic of topics){const path=topic.href.startsWith('/')?topic.href:`/${portal}/${topic.href}`;assert.ok(existsSync(`src/app${path}/page.tsx`),path);for(const copy of [topic.title,topic.tip,...topic.steps])for(const language of ['en','ha','ig','yo'] as const){assert.ok(copy[language].trim());if(language!=='en')assert.notEqual(copy[language],copy.en);}}}
  for(const copy of Object.values(guideLabels))for(const language of ['en','ha','ig','yo'] as const)assert.ok(copy[language].trim());
});
test('client and investor guides explain receipts, signatures, private identity and financial locks',()=>{
  const client=userGuideTopics('client'); const investor=userGuideTopics('investor');
  for(const id of ['profile','kyc','bank','receipt','signing','help']){assert.ok(client.some(topic=>topic.id===id));assert.ok(investor.some(topic=>topic.id===id));}
  assert.match(client.find(topic=>topic.id==='receipt')!.tip.en,/not Approved/);
  assert.match(investor.find(topic=>topic.id==='withdrawal')!.steps[1].en,/end of each 30-day/);
  assert.match(client.find(topic=>topic.id==='changes')!.steps[1].en,/not extended/);
});
test('read-only admin guide excludes money approval, KYC editing and imports',()=>{
  const ids=userGuideTopics('admin',true).map(topic=>topic.id);
  for(const id of ['admin-users','admin-bank','approvals','imports','reconciliation'])assert.ok(!ids.includes(id));
  assert.ok(ids.includes('inspect-agreements'));
});
test('progress is versioned and isolated by account, portal and read-only access',()=>{
  assert.notEqual(guideStorageKey('one','client'),guideStorageKey('two','client'));
  assert.notEqual(guideStorageKey('one','client'),guideStorageKey('one','investor'));
  assert.notEqual(guideStorageKey('one','admin'),guideStorageKey('one','admin',true));
});
test('invalid, stale or tampered reading progress is bounded and does not imply workflow completion',()=>{
  const topics=userGuideTopics('client');assert.deepEqual(parseGuideProgress('bad-json',topics),{index:0,read:[],dismissed:false});
  assert.deepEqual(parseGuideProgress(JSON.stringify({index:999,read:['bank','bank','invalid',42],dismissed:true,balance:999}),topics),{index:topics.length-1,read:['bank'],dismissed:true});
  assert.equal(parseGuideProgress(JSON.stringify({index:-20,read:'all'}),topics).index,0);
});
