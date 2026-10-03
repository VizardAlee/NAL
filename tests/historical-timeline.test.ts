import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalTimeline, historicalFundTimeline } from '../src/lib/historical-timeline';
import { historicalReversal, assertHistoricalCorrectionApproval } from '../src/lib/server/historical-corrections';
import { historicalExtractionSchema } from '../src/lib/server/historical-extraction-schema';
import { reconcileHistoricalExtraction } from '../src/lib/historical-import';
import { profitUnlockDate } from '../src/lib/workflow-eligibility';
import { calculateInvestorPortfolioValue, calculateAvailableProfit, historicalOutflowAmount } from '../src/lib/financial-integrity';

test('dated receipts are sorted and deducted from totals without double credits', () => {
  const entries = historicalTimeline(100,[{amount:20,date:'2026-01-02',reference:'B',documentName:'B.pdf'},{amount:30,date:'2026-01-01',reference:'A',documentName:'A.pdf'}],'2026-01-31');
  assert.deepEqual(entries.map(entry=>[entry.amount,entry.date,entry.openingBalance]),[[30,'2026-01-01',false],[20,'2026-01-02',false],[50,'2026-01-31',true]]);
  assert.equal(entries.reduce((sum,entry)=>sum+entry.amount,0),100);
  assert.throws(()=>historicalTimeline(10,[{amount:20,date:'2026-01-01',reference:'A',documentName:'A.pdf'}],'2026-01-31'));
});

test('multiple contracts for one investor require explicit ownership-correct funding links', () => {
  const extraction=historicalExtractionSchema.parse({party:{name:'Client'},deals:[{id:'deal',dealName:'Deal',clientId:'client',principal:100,profitRate:0,startDate:'2026-01-01',documentedOutstanding:100,investors:[{investorId:'investor',investorName:'Investor',amountInvested:100}]}],fundPositions:[{id:'contract-a',investorId:'investor',investorName:'Investor'},{id:'contract-b',investorId:'investor',investorName:'Investor'}]});
  assert.ok(reconcileHistoricalExtraction(extraction).some(issue=>issue.code==='AMBIGUOUS_INVESTMENT_CONTRACT'));
  extraction.deals[0].investors[0].fundPositionId='contract-b';
  assert.ok(!reconcileHistoricalExtraction(extraction).some(issue=>['AMBIGUOUS_INVESTMENT_CONTRACT','INVALID_CONTRACT_LINK'].includes(issue.code)));
  extraction.deals[0].investors[0].fundPositionId='nonexistent';
  assert.ok(reconcileHistoricalExtraction(extraction).some(issue=>issue.code==='INVALID_CONTRACT_LINK'));
  extraction.deals[0].startDate='2026-02-31';
  assert.ok(reconcileHistoricalExtraction(extraction).some(issue=>issue.code==='START_DATE_REQUIRED'));
});

test('corrections require independent approval and preserve original profit-release dates', () => {
  assert.throws(()=>assertHistoricalCorrectionApproval('admin-a','admin-a','wrong amount','receipt A'));
  assert.throws(()=>assertHistoricalCorrectionApproval('admin-a','admin-b','wrong amount',''));
  assert.doesNotThrow(()=>assertHistoricalCorrectionApproval('admin-a','admin-b','wrong amount','receipt A'));
  const date=new Date('2026-01-02T12:00:00Z');
  const original={amount:100,type:'ProfitDistribution',createdAt:date,profitEarnedAt:date};
  const reversal=historicalReversal(original,'revision','transactions/original','admin-b');
  assert.equal(reversal.amount,-100);
  assert.equal(reversal.profitEarnedAt,date);
  assert.equal(original.amount,100);
  assert.equal(reversal.reversesPath,'transactions/original');
});

test('financial metrics net reversals instead of counting them as extra withdrawals or profit', () => {
  const reverse = {historicalCorrection:true,reversesPath:'transactions/old'};
  const entries=[{type:'Deposit',amount:100},{type:'Withdrawal',amount:-20},{type:'Withdrawal',amount:20,...reverse},{type:'Withdrawal',amount:-10},{type:'ProfitDistribution',amount:30},{type:'ProfitDistribution',amount:-30,...reverse},{type:'ProfitDistribution',amount:25}];
  assert.equal(calculateInvestorPortfolioValue(entries),115);
  assert.equal(calculateAvailableProfit(entries),15);
  assert.equal(historicalOutflowAmount({amount:20,...reverse}),-20);
  assert.equal(historicalOutflowAmount({amount:20}),20); // legacy positive withdrawals remain outflows
});

test('ninety-day historical contracts retain dated thirty-day profit tranches', () => {
  const extraction=historicalExtractionSchema.parse({party:{name:'Investor'},fundPositions:[{id:'fund-a',investorId:'SELF',investorName:'Investor',balancesVerified:true,balanceEvidence:'Reconciled statement',totalDeposited:100,availableCapital:100,investmentTerms:{capitalCommitted:100,agreementDate:'2026-01-01',paymentDate:'2026-01-01',maturityDate:'2026-03-31',tenureValue:90,tenureUnit:'Days',investorProfitShare:40,companyProfitShare:60,paymentReference:'A',capitalLockedUntilMaturity:true,annualProfitWithdrawalPercent:0,annualWithdrawalWindowDays:0},transactions:[{type:'Deposit',amount:100,date:'2026-01-01',reference:'A',documentName:'Receipt A'}],historyComplete:true}]});
  assert.deepEqual(reconcileHistoricalExtraction(extraction,'2026-02-10').filter(issue=>issue.severity==='ERROR'),[]);
  const batch={tenureValue:90,tenureUnit:'Days' as const,paymentDate:new Date('2026-01-01T12:00:00Z')};
  const first=profitUnlockDate(batch,{profitEarnedAt:new Date('2026-01-10T12:00:00Z')});
  const second=profitUnlockDate(batch,{profitEarnedAt:new Date('2026-02-05T12:00:00Z')});
  assert.equal(first?.toISOString(),'2026-01-31T12:00:00.000Z');
  assert.equal(second?.toISOString(),'2026-03-02T12:00:00.000Z');
  const nigeriaBatch={...batch,paymentDate:new Date('2025-12-31T23:00:00Z')};
  assert.equal(profitUnlockDate(nigeriaBatch,{profitEarnedAt:new Date('2026-01-30T12:00:00Z')})?.toISOString(),'2026-01-30T23:00:00.000Z');
  assert.equal(profitUnlockDate(nigeriaBatch,{profitEarnedAt:new Date('2026-01-31T12:00:00Z')})?.toISOString(),'2026-03-01T23:00:00.000Z');
  assert.equal(historicalFundTimeline(extraction.fundPositions[0],'Deposit','2026-02-10')[0].openingBalance,false);
  assert.ok(reconcileHistoricalExtraction(extraction,'2025-12-31').some(issue=>issue.code==='INVALID_HISTORY_DATE'));
});
