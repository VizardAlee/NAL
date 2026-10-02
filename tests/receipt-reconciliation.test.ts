import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBankAllocation, bankIdentity, parseBankCsv, suggestReceiptMatches, isOpeningBalanceEvidence, receiptFieldsSchema, type BankRow, type ReceiptFields } from '../src/lib/receipt-reconciliation';

const receipt: ReceiptFields = { amount: 50000.25, paymentDate:'2026-09-30', reference:'ABC-123', sender:'Customer', beneficiary:'NAL', accountNumber:'0513848871', transferStatus:'SUCCESSFUL' };
const bank: BankRow = {id:'bank-1',date:'2026-09-30',amount:50000.25,direction:'CREDIT',reference:'ABC123',description:'Incoming payment',accountNumber:'0513848871',allocatedAmount:0,reversed:false};

test('CSV imports structured bank rows without asking AI to calculate amounts',()=>{
  const rows=parseBankCsv('date,amount,direction,reference,description\n2026-09-30,"50,000.25",CREDIT,ABC-123,Repayment');
  assert.equal(rows[0].amount,50000.25);
  assert.equal(rows[0].direction,'CREDIT');
});
test('unknown bank-specific columns require explicit conversion',()=>{
  assert.throws(()=>parseBankCsv('value date,credit,narration\n30/09/2026,5000,Test'),/CSV needs/);
});
test('malformed dates, negative and sub-kobo amounts are rejected',()=>{
  for(const input of ['2026-09-30,-3,CREDIT','30/09/2026,100,CREDIT','2026-09-30,0.001,CREDIT']) assert.throws(()=>parseBankCsv('date,amount,direction\n'+input));
  assert.equal(receiptFieldsSchema.safeParse({...receipt,amount:0.001}).success,false);
});
test('reference-bearing bank rows deduplicate across changed narration and posting date',()=>{
  assert.equal(bankIdentity(bank),bankIdentity({...bank,date:'2026-10-01',description:'Updated narration'}));
  assert.notEqual(bankIdentity(bank),bankIdentity({...bank,accountNumber:'1234567890'}));
});
test('an exact reference, amount, account and successful transfer suggest a strong match',()=>{
  assert.deepEqual(suggestReceiptMatches(receipt,'REPAYMENT',[bank]),[{id:'bank-1',strong:true}]);
});
test('receipts for multiple NAL accounts stay matched to their own statement',()=>{
  const alternate = {...bank,id:'second-bank',accountNumber:'0123456789'};
  assert.deepEqual(suggestReceiptMatches({...receipt,accountNumber:alternate.accountNumber},'REPAYMENT',[bank,alternate]),[{id:'second-bank',strong:true}]);
  assert.throws(()=>assertBankAllocation({...receipt,accountNumber:alternate.accountNumber},'REPAYMENT',bank),/Bank account/);
  assert.doesNotThrow(()=>assertBankAllocation({...receipt,accountNumber:alternate.accountNumber},'REPAYMENT',alternate));
});
test('no reference is never a strong candidate; duplicate candidates remain explicit',()=>{
  assert.deepEqual(suggestReceiptMatches({...receipt,reference:''},'REPAYMENT',[bank]),[{id:'bank-1',strong:false}]);
  assert.equal(suggestReceiptMatches(receipt,'REPAYMENT',[bank,{...bank,id:'bank-2'}]).length,2);
});
test('failed, pending, reversed, wrong-account and distant entries do not match',()=>{
  for(const status of ['FAILED','PENDING'] as const) assert.deepEqual(suggestReceiptMatches({...receipt,transferStatus:status},'REPAYMENT',[bank]),[]);
  for(const row of [{...bank,reversed:true},{...bank,accountNumber:'1234567890'},{...bank,date:'2026-09-20'}]) assert.deepEqual(suggestReceiptMatches(receipt,'REPAYMENT',[row]),[]);
});
test('debits verify procurement, never client repayments',()=>{
  assert.throws(()=>assertBankAllocation(receipt,'REPAYMENT',{...bank,direction:'DEBIT'}),/credit\/debit/);
  assert.doesNotThrow(()=>assertBankAllocation(receipt,'PROCUREMENT',{...bank,direction:'DEBIT'}));
});
test('partial allocations are capped at remaining bank funds, including decimals',()=>{
  const row={...bank,amount:60000.25,allocatedAmount:10000};
  assert.doesNotThrow(()=>assertBankAllocation(receipt,'REPAYMENT',row));
  assert.throws(()=>assertBankAllocation(receipt,'REPAYMENT',{...row,allocatedAmount:10000.01}),/exceeds/);
  assert.throws(()=>assertBankAllocation(receipt,'REPAYMENT',{...bank,allocatedAmount:bank.amount}),/exceeds/);
});
test('unknown/failed transfers and reversals cannot be posted',()=>{
  assert.throws(()=>assertBankAllocation({...receipt,transferStatus:'UNKNOWN'},'REPAYMENT',bank),/successful/);
  assert.throws(()=>assertBankAllocation(receipt,'REPAYMENT',{...bank,reversed:true}),/reversed/);
});
test('migration cut-off is inclusive: existing payments never credit an opening total twice',()=>{
  assert.equal(isOpeningBalanceEvidence('2026-09-30','2026-09-30T12:00:00Z'),true);
  assert.equal(isOpeningBalanceEvidence('2026-10-01','2026-09-30'),false);
  assert.equal(isOpeningBalanceEvidence('2026-09-30'),false);
  assert.deepEqual(suggestReceiptMatches(receipt,'HISTORICAL_EVIDENCE',[bank]),[]);
});
