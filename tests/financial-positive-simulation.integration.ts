import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { adminDb as db, getAdminApp } from '../src/firebase/admin-app';
import { requestWithdrawalAction, requestCapitalWithdrawalAction, reinvestAction } from '../src/app/investor/dashboard/withdrawal-actions';
import { processReinvestmentRequestAction, processWithdrawalRequestAction, processTerminationRequestAction } from '../src/app/admin/approvals/actions';
import { updateAccessRoleAction } from '../src/app/admin/users/[userId]/actions';
import { processOwnerProfitAllocations } from '../src/lib/server/owner-profit';
import { calculateAvailableProfit, calculateFundBatchAnniversaryWindow, roundCurrency } from '../src/lib/financial-integrity';
import { generateAmortizationSchedule } from '../src/lib/amortization';
import type { Deal } from '../src/lib/types';

if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== 'demo-nal-acceptance' || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true' || process.env.K_SERVICE || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(k=>!/^127\.0\.0\.1:\d+$/.test(process.env[k]||''))) throw new Error('Existing guarded loopback demo emulators only; production is forbidden.');
const DAY=86400000;
const ago=(days:number)=>Timestamp.fromDate(new Date(Date.now()-days*DAY));
const uid=(key:string)=>`positive-${key}`;
const tokens:Record<string,string>={};
const keys=['admin','staff','owner1','owner2','short','reinvest','locked','mature','capital','anniversary','annual-expired','annual-caps','annual-stale','term','client'];
const cash=async(user:string)=>roundCurrency((await db.collection('fundBatches').where('sourceId','==',uid(user)).get()).docs.reduce((n,d)=>n+Number(d.data().remainingAmount||0),0));
const entries=async(user:string)=>(await db.collection('transactions').where('userId','==',uid(user)).get()).docs.map(d=>d.data());
const form=(key:string,amount:number,source='ShortTermProfit')=>{const f=new FormData();for(const [k,v] of Object.entries({authToken:tokens[key],userId:uid(key),userName:`Synthetic ${key}`,amount:String(amount),source}))f.set(k,v);return f;};
async function seedProfit(key:string,days:number,tenureValue=90,profit=40){
 const batchId=`positive-${key}-capital`;
 await db.doc('fundBatches/'+batchId).set({sourceId:uid(key),amount:100,remainingAmount:100,createdAt:ago(days),paymentDate:ago(days),tenureValue,tenureUnit:'Days'});
 await db.doc('transactions/'+batchId+'-deposit').set({userId:uid(key),type:'Deposit',amount:100,createdAt:ago(days)});
 await db.doc('transactions/'+batchId+'-profit').set({userId:uid(key),type:'ProfitDistribution',amount:profit,fundBatchId:batchId,createdAt:ago(Math.max(1,days-20)),profitEarnedAt:ago(Math.max(1,days-20))});
 return batchId;
}
before(async()=>{
 for(const key of keys){
  await getAuth(getAdminApp()).createUser({uid:uid(key),email:`${uid(key)}@nal.test`,password:'Emulator-only-123!',emailVerified:true});
  const accessRole=key==='admin'?'ADMIN':key==='staff'?'STAFF':key.startsWith('owner')?'OWNER':'USER';
  await db.doc('users/'+uid(key)).set({name:`Synthetic ${key}`,email:`${uid(key)}@nal.test`,accessRole,role:accessRole==='USER'?(key==='client'?'Client':'Investor'):'Admin',personas:accessRole==='USER'?[key==='client'?'CLIENT':'INVESTOR']:[],primaryPortal:accessRole==='OWNER'?'owner':accessRole==='USER'?(key==='client'?'client':'investor'):'admin',isMuslim:false});
  const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`${uid(key)}@nal.test`,password:'Emulator-only-123!',returnSecureToken:true})});tokens[key]=(await r.json()).idToken;assert.ok(tokens[key]);
 }
});
after(async()=>{await getAdminApp().delete();});

test('owner allocation splits kobo exactly and concurrent attempts create one allocation and one set of credits',async()=>{
 await db.doc('platformPolicies/ownerProfit').set({retainedPercent:30,distributablePercent:70,totalShares:3});
 for(const [key,shares] of [['owner1',1],['owner2',2]] as const)await db.doc('ownershipPartners/'+uid(key)).set({userId:uid(key),displayName:`Synthetic ${key}`,shareUnits:shares,active:true});
 await db.doc('transactions/positive-operating-earning').set({userId:'platform',type:'PlatformEarning',amount:100.01,ownerAllocatable:true,ownerAllocationId:null,createdAt:Timestamp.now()});
 await db.doc('fundBatches/positive-platform-earning').set({sourceId:'platform',amount:100.01,remainingAmount:100.01,tenureValue:10,tenureUnit:'Years',createdAt:Timestamp.now()});
 const results=await Promise.all([processOwnerProfitAllocations(),processOwnerProfitAllocations()]);assert.ok(results.every(r=>r.errors===0));assert.equal(results.reduce((sum,r)=>sum+r.processed,0),1);
 const allocation=(await db.doc('ownerProfitAllocations/tx_positive-operating-earning').get()).data()!;
 assert.deepEqual(allocation.platformCashDeductions,[{fundBatchId:'positive-platform-earning',amount:70.01}]);
 assert.equal(allocation.sourceEarningAmount,100.01);assert.equal(allocation.retainedAmount,30);assert.equal(allocation.distributableAmount,70.01);
 assert.deepEqual(allocation.partnerSnapshot.map((p:any)=>p.allocatedAmount),[23.33,46.68]);
 assert.equal((await db.collection('ownerProfitAllocations').get()).size,1);
 assert.equal(await cash('owner1'),23.33);assert.equal(await cash('owner2'),46.68);
 const credits=(await db.collection('transactions').where('ownerAllocationId','==','tx_positive-operating-earning').get()).docs;
 assert.equal(credits.filter(d=>d.data().sourceType==='OwnerProfitAutoAllocation').length,2);
 assert.equal(credits.filter(d=>d.data().userId==='platform'&&d.data().amount===-70.01).length,1);
 assert.equal((await processOwnerProfitAllocations()).processed,0);
});

test('owner distribution must not count the same operating cash in both platform and owner fund batches',async()=>{
 const platform=(await db.doc('fundBatches/positive-platform-earning').get()).data()!.remainingAmount;
 const owner=roundCurrency(await cash('owner1')+await cash('owner2'));
 console.log('OWNER_CASH_CHECK',JSON.stringify({sourceOperatingCash:100.01,platformRemaining:platform,ownerRemaining:owner,totalAvailable:roundCurrency(platform+owner)}));
 assert.equal(roundCurrency(platform+owner),100.01,'Owner distribution should transfer availability, not increase total fundable cash.');
});

test('owner withdrawal is closed outside the window, single-request per open window and admin-only once approved',async()=>{
 await db.doc('platformSettings/ownerWithdrawalWindow').set({quarters:[]});
 assert.equal((await requestWithdrawalAction({},form('owner1',10))).success,false);
 const date=(delta:number)=>new Date(Date.now()+delta*DAY).toISOString().slice(0,10);
 await db.doc('platformSettings/ownerWithdrawalWindow').set({quarters:[{label:'Synthetic open window',startDate:date(-2),endDate:date(2)}]});
 const attempts=await Promise.all([requestWithdrawalAction({},form('owner1',10)),requestWithdrawalAction({},form('owner1',10))]);assert.equal(attempts.filter(a=>a.success).length,1);
 const rows=await db.collection('withdrawalRequests').where('investorId','==',uid('owner1')).get();assert.equal(rows.size,1);const id=rows.docs[0].id;
 await assert.rejects(processWithdrawalRequestAction({authToken:tokens.staff,requestId:id,decision:'Approved'}));
 const approvals=await Promise.allSettled([processWithdrawalRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'}),processWithdrawalRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'})]);assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(await cash('owner1'),13.33);assert.equal((await db.doc('withdrawalRequests/'+id).get()).data()!.status,'Approved');
 const ledger=await db.collection('transactions').where('sourceRequestId','==',id).get();assert.equal(ledger.size,1);assert.equal(ledger.docs[0].data().amount,-10);assert.equal(ledger.docs[0].data().sourceType,'OwnerProfitWithdrawal');
 assert.equal((await requestWithdrawalAction({},form('owner1',1))).success,false);
});

test('owner share mismatch refuses allocation without new allocation records',async()=>{
 const count=(await db.collection('ownerProfitAllocations').get()).size;
 await db.doc('ownershipPartners/'+uid('owner1')).update({shareUnits:2});
 try{await assert.rejects(processOwnerProfitAllocations(),/mismatch/);assert.equal((await db.collection('ownerProfitAllocations').get()).size,count);}finally{await db.doc('ownershipPartners/'+uid('owner1')).update({shareUnits:1});}
});

test('short-term realised profit withdrawal reserves capacity and one approval consumes funds and profit once',async()=>{
 await seedProfit('short',100);
 const result=await requestWithdrawalAction({},form('short',10));assert.equal(result.success,true,JSON.stringify(result));
 assert.equal((await requestWithdrawalAction({},form('short',31))).success,false);
 const pending=(await db.collection('withdrawalRequests').where('investorId','==',uid('short')).get()).docs;assert.equal(pending.length,1);const id=pending[0].id;
 const attempts=await Promise.allSettled([processWithdrawalRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'}),processWithdrawalRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'})]);assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
 assert.equal(await cash('short'),100);assert.equal(calculateAvailableProfit(await entries('short')),30);
 assert.equal((await db.collection('transactions').where('sourceRequestId','==',id).get()).size,1);
});

test('positive reinvestment reserves available profit and approval creates one rollover without duplicate credits',async()=>{
 await seedProfit('reinvest',100);
 const request={authToken:tokens.reinvest,amount:30,userId:uid('reinvest'),userName:'Synthetic reinvest'};
 const attempts=await Promise.all([reinvestAction(request),reinvestAction(request)]);assert.equal(attempts.filter(r=>r.success).length,1);
 const pending=(await db.collection('reinvestmentRequests').where('investorId','==',uid('reinvest')).get()).docs;assert.equal(pending.length,1);const id=pending[0].id;
 await assert.rejects(processReinvestmentRequestAction({authToken:tokens.staff,requestId:id,decision:'Approved'}));
 const approvals=await Promise.allSettled([processReinvestmentRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved',specialInvestment:true}),processReinvestmentRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved',specialInvestment:true})]);assert.equal(approvals.filter(a=>a.status==='fulfilled').length,1);
 const tx=(await db.collection('transactions').where('sourceRequestId','==',id).get()).docs.map(d=>d.data());assert.equal(tx.length,2);assert.equal(tx.reduce((n,t)=>n+t.amount,0),0);assert.equal(tx.find(t=>t.type==='Withdrawal')!.amount,-30);
 const batch=(await db.collection('fundBatches').where('sourceRequestId','==',id).get()).docs;assert.equal(batch.length,1);assert.equal(batch[0].data().remainingAmount,30);assert.equal(batch[0].data().specialInvestment,true);
 assert.equal(await cash('reinvest'),130);assert.equal(calculateAvailableProfit(await entries('reinvest')),10);
 assert.equal((await reinvestAction({...request,amount:11})).success,false);
});

test('longer-term profit is refused before maturity and accepted after documented maturity',async()=>{
 await seedProfit('locked',50,365,25);
 assert.equal((await requestWithdrawalAction({},form('locked',5))).success,false);
 assert.equal((await reinvestAction({authToken:tokens.locked,userId:uid('locked'),userName:'Synthetic locked',amount:5})).success,false);
 assert.equal((await db.collection('withdrawalRequests').where('investorId','==',uid('locked')).get()).size,0);
 await seedProfit('mature',400,365,25);
 const result=await requestWithdrawalAction({},form('mature',5));assert.equal(result.success,true,JSON.stringify(result));
 const row=(await db.collection('withdrawalRequests').where('investorId','==',uid('mature')).get()).docs[0];
 await processWithdrawalRequestAction({authToken:tokens.admin,requestId:row.id,decision:'Approved'});assert.equal(await cash('mature'),100);
});

test('matured executed short-term capital can be requested once and approval deducts only its specified batch',async()=>{
 const id='positive-capital-signed';
 await db.doc('fundBatches/'+id).set({sourceId:uid('capital'),amount:100,remainingAmount:100,createdAt:ago(100),tenureValue:90,tenureUnit:'Days'});
 await db.doc('agreementEnvelopes/mudaraba_'+id).set({status:'EXECUTED',documentModel:{maturityDate:ago(2).toDate().toISOString()}});
 await db.doc('fundBatches/positive-capital-other').set({sourceId:uid('capital'),amount:70,remainingAmount:70,createdAt:ago(150),tenureValue:90,tenureUnit:'Days'});
 const input={authToken:tokens.capital,userId:uid('capital'),userName:'Synthetic capital',batchId:id};
 const results=await Promise.all([requestCapitalWithdrawalAction(input),requestCapitalWithdrawalAction(input)]);assert.ok(results.every(r=>r.success));
 const requests=await db.collection('withdrawalRequests').where('investorId','==',uid('capital')).get();assert.equal(requests.size,1);
 await processWithdrawalRequestAction({authToken:tokens.admin,requestId:requests.docs[0].id,decision:'Approved'});
 assert.equal((await db.doc('fundBatches/'+id).get()).data()!.remainingAmount,0);assert.equal((await db.doc('fundBatches/positive-capital-other').get()).data()!.remainingAmount,70);
});

let annualBatch='';
test('an open annual window permits the documented 20-percent profit allowance before final maturity',async()=>{
 const now=new Date();const opened=new Date(now);opened.setUTCDate(opened.getUTCDate()-1);const start=new Date(opened);start.setUTCFullYear(start.getUTCFullYear()-1);
 annualBatch='positive-anniversary-batch';
 await db.doc('fundBatches/'+annualBatch).set({sourceId:uid('anniversary'),amount:100,remainingAmount:100,createdAt:Timestamp.fromDate(start),tenureValue:3,tenureUnit:'Years'});
 const profitDate=new Date(opened.getTime()-10*DAY);
 await db.doc('transactions/positive-anniversary-profit').set({userId:uid('anniversary'),type:'ProfitDistribution',amount:20,fundBatchId:annualBatch,createdAt:Timestamp.fromDate(profitDate)});
 const batches=(await db.collection('fundBatches').where('sourceId','==',uid('anniversary')).get()).docs.map(d=>({id:d.id,...d.data()}));
 const window=calculateFundBatchAnniversaryWindow({fundBatches:batches,entries:await entries('anniversary'),now});assert.equal(window.isOpen,true);assert.equal(window.availableToWithdraw,4);
 assert.equal((await requestWithdrawalAction({},form('anniversary',1))).success,false,'Ordinary profit must stay locked');
 const attempts=await Promise.all([requestWithdrawalAction({},form('anniversary',4,'AnniversaryProfit')),requestWithdrawalAction({},form('anniversary',4,'AnniversaryProfit'))]);
 assert.equal(attempts.filter(r=>r.success).length,1,'Concurrent annual requests must reserve the allowance once');
 const result=attempts.find(r=>r.success)!;
 console.log('ANNUAL_WITHDRAWAL_CHECK',JSON.stringify({windowOpen:window.isOpen,allowance:window.availableToWithdraw,result}));
 assert.equal(result.success,true,'Open annual allowance should be usable, not filtered out by the ordinary maturity lock.');
});

test('administrator approval of an eligible annual-window request honors the same allowance',async()=>{
 const rows=await db.collection('withdrawalRequests').where('investorId','==',uid('anniversary')).get();assert.equal(rows.size,1);const id=rows.docs[0].id;
 await assert.rejects(processWithdrawalRequestAction({authToken:tokens.staff,requestId:id,decision:'Approved'}));
 const outcomes=await Promise.allSettled([processWithdrawalRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'}),processWithdrawalRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.doc('withdrawalRequests/'+id).get()).data()!.status,'Approved');
 assert.equal(await cash('anniversary'),100);assert.equal(calculateAvailableProfit(await entries('anniversary')),16);
 assert.equal((await db.collection('transactions').where('sourceRequestId','==',id).get()).size,1);
 assert.equal((await requestWithdrawalAction({},form('anniversary',1,'AnniversaryProfit'))).success,false,'Approved allowance cannot be spent again');
});

test('full termination credits only the remaining principal/profit once and preserves original contract locks and owner source type',async()=>{
 const dealId='positive-termination-deal';const requestId='positive-termination-request';
 const deal={clientId:uid('client'),clientName:'Synthetic client',dealName:'Synthetic full settlement',principal:100,profitRate:20,status:'Active',startDate:ago(2),createdAt:ago(2),durationValue:2,durationUnit:'Days',repaymentFrequency:'Daily',repaymentType:'Equal Installments',financingMode:'Murabaha'};
 await db.doc('deals/'+dealId).set(deal);
 const lock=ago(-50);await db.doc('fundBatches/positive-term-contract').set({sourceId:uid('term'),amount:60,remainingAmount:0,createdAt:ago(40),tenureValue:90,tenureUnit:'Days',principalLockedUntil:lock});
 const ownerOriginal=(await db.collection('fundBatches').where('sourceId','==',uid('owner2')).get()).docs[0];
 await ownerOriginal.ref.update({remainingAmount:roundCurrency(ownerOriginal.data().remainingAmount-40)});
 await db.doc('investments/positive-term-a').set({dealId,investorId:uid('term'),fundBatchId:'positive-term-contract',amount:60});
 await db.doc('investments/positive-term-b').set({dealId,investorId:uid('owner2'),fundBatchId:ownerOriginal.id,amount:40,sourceType:'OwnerProfitAutoAllocation'});
 await db.doc('repayments/positive-term-paid').set({dealId,clientId:uid('client'),status:'Approved',amount:60,installmentNumber:1,principalApplied:50,interestApplied:10});
 await db.doc('repayments/positive-term-pending').set({dealId,clientId:uid('client'),status:'Pending',amount:18,installmentNumber:2});
 await db.doc('terminationRequests/'+requestId).set({dealId,clientId:uid('client'),clientName:'Synthetic client',dealName:deal.dealName,status:'Pending',requestedAt:Timestamp.now()});
 const schedule=generateAmortizationSchedule({id:dealId,...deal} as Deal);assert.equal(schedule.reduce((n,r)=>n+r.payment,0),120);
 const results=await Promise.allSettled([processTerminationRequestAction({authToken:tokens.admin,requestId,decision:'Approved'}),processTerminationRequestAction({authToken:tokens.admin,requestId,decision:'Approved'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const request=(await db.doc('terminationRequests/'+requestId).get()).data()!;assert.equal(request.remainingPrincipal,50);assert.equal(request.remainingProfit,10);assert.equal(request.settlementAmount,60);assert.equal(request.platformEarning,6);
 assert.equal((await db.doc('deals/'+dealId).get()).data()!.status,'Terminated');
 assert.equal((await db.doc('repayments/positive-term-pending').get()).data()!.status,'Cancelled');
 assert.equal((await db.collection('repayments').where('sourceRequestId','==',requestId).get()).size,1);
 const contract=(await db.doc('fundBatches/positive-term-contract').get()).data()!;assert.equal(contract.remainingAmount,30);assert.equal(contract.principalLockedUntil.toMillis(),lock.toMillis());
 const returns=(await db.collection('fundBatches').where('sourceRequestId','==',requestId).get()).docs.map(d=>d.data());const ownerReturn=returns.find(d=>d.sourceId===uid('owner2'))!;assert.equal(ownerReturn.remainingAmount,20);assert.equal(ownerReturn.sourceType,'OwnerProfitAutoAllocation');
 const tx=(await db.collection('transactions').where('sourceRequestId','==',requestId).get()).docs.map(d=>d.data());assert.equal(tx.length,4);assert.equal(tx.filter(d=>d.type==='ProfitDistribution').reduce((n,d)=>n+d.amount,0),4);assert.equal(tx.find(d=>d.type==='Repayment')!.amount,-60);
});

async function seedAnnual(key:string,daysSinceAnniversary=1){
 const opened=new Date(Date.now()-daysSinceAnniversary*DAY);const start=new Date(opened);start.setUTCFullYear(start.getUTCFullYear()-1);
 const batchId=`positive-${key}-annual`;
 await db.doc('fundBatches/'+batchId).set({sourceId:uid(key),amount:100,remainingAmount:100,createdAt:Timestamp.fromDate(start),tenureValue:3,tenureUnit:'Years'});
 await db.doc('transactions/'+batchId+'-profit').set({userId:uid(key),type:'ProfitDistribution',amount:20,fundBatchId:batchId,createdAt:Timestamp.fromDate(new Date(opened.getTime()-10*DAY))});
 return batchId;
}

test('annual request and approval refuse closed or stale windows and cross-user tokens without posting',async()=>{
 const batchId=await seedAnnual('annual-expired',7);
 assert.equal((await requestWithdrawalAction({},form('annual-expired',4,'AnniversaryProfit'))).success,false);
 const pending='positive-expired-request';await db.doc('withdrawalRequests/'+pending).set({investorId:uid('annual-expired'),amount:4,status:'Pending',type:'InvestorWithdrawal',source:'AnniversaryProfit',anniversaryWindowIds:[batchId+':year-1']});
 await assert.rejects(processWithdrawalRequestAction({authToken:tokens.admin,requestId:pending,decision:'Approved'}),/no longer open/);
 assert.equal((await db.doc('withdrawalRequests/'+pending).get()).data()!.status,'Pending');assert.equal(await cash('annual-expired'),100);
 assert.equal((await db.collection('transactions').where('sourceRequestId','==',pending).get()).size,0);
 const fresh=await seedAnnual('annual-stale');const tampered=form('annual-stale',4,'AnniversaryProfit');tampered.set('authToken',tokens.client);
 assert.equal((await requestWithdrawalAction({},tampered)).success,false);
 for(const [id,windows] of [['positive-no-window',[]],['positive-stale-window',[fresh+':year-2']]] as const){
  await db.doc('withdrawalRequests/'+id).set({investorId:uid('annual-stale'),amount:4,status:'Pending',type:'InvestorWithdrawal',source:'AnniversaryProfit',anniversaryWindowIds:windows});
  await assert.rejects(processWithdrawalRequestAction({authToken:tokens.admin,requestId:id,decision:'Approved'}),/no longer open/);
  assert.equal((await db.doc('withdrawalRequests/'+id).get()).data()!.status,'Pending');
  assert.equal((await db.collection('transactions').where('sourceRequestId','==',id).get()).size,0);
 }
});

test('annual exception retains profit and reservation caps without consuming principal cash',async()=>{
 const batchId=await seedAnnual('annual-caps');
 await db.doc('transactions/positive-annual-consumed').set({userId:uid('annual-caps'),type:'Withdrawal',amount:-18,metadata:{source:'ProfitReinvestment'},createdAt:Timestamp.now()});
 assert.equal((await requestWithdrawalAction({},form('annual-caps',3,'AnniversaryProfit'))).success,false);
 await db.doc('reinvestmentRequests/positive-annual-reserve').set({investorId:uid('annual-caps'),amount:1,status:'Pending'});
 assert.equal((await requestWithdrawalAction({},form('annual-caps',2,'AnniversaryProfit'))).success,false);
 assert.equal((await requestWithdrawalAction({},form('annual-caps',1,'AnniversaryProfit'))).success,true);
 const request=(await db.collection('withdrawalRequests').where('investorId','==',uid('annual-caps')).get()).docs[0];
 await db.doc('reinvestmentRequests/positive-annual-reserve').update({amount:2});
 await assert.rejects(processWithdrawalRequestAction({authToken:tokens.admin,requestId:request.id,decision:'Approved'}),/unreserved profit/);
 await db.doc('reinvestmentRequests/positive-annual-reserve').update({amount:1});
 await db.doc('fundBatches/'+batchId).update({remainingAmount:0.5});
 await processWithdrawalRequestAction({authToken:tokens.admin,requestId:request.id,decision:'Approved'});
 assert.equal((await request.ref.get()).data()!.status,'Approved');assert.equal(await cash('annual-caps'),0.5);
 assert.equal((await db.collection('transactions').where('sourceRequestId','==',request.id).get()).size,1);
 assert.equal(calculateAvailableProfit(await entries('annual-caps')),1);
});

test('insufficient platform cash leaves owner allocation pending without partial credits or ledger writes',async()=>{
 const before={allocations:(await db.collection('ownerProfitAllocations').get()).size,tx:(await db.collection('transactions').get()).size,owner1:await cash('owner1'),owner2:await cash('owner2')};
 const ref=db.doc('transactions/positive-unfunded-earning');await ref.set({userId:'platform',type:'PlatformEarning',amount:10000,ownerAllocatable:true,ownerAllocationId:null,createdAt:Timestamp.now()});
 const platformBefore=(await db.collection('fundBatches').where('sourceId','==','platform').get()).docs.map(d=>({id:d.id,...d.data()}));
 const result=await processOwnerProfitAllocations();assert.equal(result.processed,0);assert.equal(result.errors,1);assert.match(result.details.join(' '),/Insufficient available platform cash/);
 assert.equal((await db.collection('ownerProfitAllocations').get()).size,before.allocations);assert.equal((await db.collection('transactions').get()).size,before.tx+1);
 assert.equal(await cash('owner1'),before.owner1);assert.equal(await cash('owner2'),before.owner2);assert.equal((await ref.get()).data()!.ownerAllocationId,null);
 assert.deepEqual((await db.collection('fundBatches').where('sourceId','==','platform').get()).docs.map(d=>({id:d.id,...d.data()})),platformBefore);
 await ref.update({ownerAllocatable:false});
});

test('competing owner allocations transfer pooled platform kobo once, never overdraw, and retain policy and investor cash',async()=>{
 const platform=(await db.collection('fundBatches').where('sourceId','==','platform').get()).docs;
 for(const doc of platform)await doc.ref.update({remainingAmount:0});
 const policy=(await db.doc('platformPolicies/ownerProfit').get()).data();const otherCash=await cash('capital');
 for(const [id,amount,days] of [['positive-cash-old',10.01,2],['positive-cash-new',5,1]] as const)await db.doc('fundBatches/'+id).set({sourceId:'platform',amount,remainingAmount:amount,createdAt:ago(days)});
 for(const id of ['positive-compete-a','positive-compete-b'])await db.doc('transactions/'+id).set({userId:'platform',type:'PlatformEarning',amount:20,ownerAllocatable:true,ownerAllocationId:null,createdAt:Timestamp.now()});
 const before=(await db.collection('ownerProfitAllocations').get()).size;const ownersBefore=roundCurrency(await cash('owner1')+await cash('owner2'));
 const runs=await Promise.all([processOwnerProfitAllocations(),processOwnerProfitAllocations()]);assert.equal(runs.reduce((n,r)=>n+r.processed,0),1);
 assert.equal((await db.collection('ownerProfitAllocations').get()).size,before+1);
 const batches=(await db.collection('fundBatches').where('sourceId','==','platform').get()).docs;
 assert.ok(batches.every(d=>d.data().remainingAmount>=0));const platformRemaining=roundCurrency(batches.reduce((n,d)=>n+d.data().remainingAmount,0));assert.equal(platformRemaining,1.01);
 const ownerIncrease=roundCurrency(await cash('owner1')+await cash('owner2')-ownersBefore);assert.equal(ownerIncrease,14);assert.equal(roundCurrency(ownerIncrease+platformRemaining),15.01);
 const allocated=(await db.collection('ownerProfitAllocations').get()).docs.find(d=>d.id.startsWith('tx_positive-compete-'))!.data();
 assert.deepEqual(allocated.platformCashDeductions,[{fundBatchId:'positive-cash-old',amount:10.01},{fundBatchId:'positive-cash-new',amount:3.99}]);
 const again=await processOwnerProfitAllocations();assert.equal(again.processed,0);assert.equal(again.errors,1);
 assert.deepEqual((await db.doc('platformPolicies/ownerProfit').get()).data(),policy);assert.equal(await cash('capital'),otherCash);
});


test('parallel owner demotions retain one owner and preserve personas and claims', async () => {
  const change = (key: string, role: 'OWNER' | 'USER', authToken = tokens.admin) =>
    updateAccessRoleAction({ authToken, actorId: uid('admin'), targetUserId: uid(key), newAccessRole: role });
  await db.doc('users/' + uid('owner1')).update({ personas: ['MARKETER'] });
  for (const key of ['owner1', 'owner2']) {
    const profile = (await db.doc('users/' + uid(key)).get()).data()!;
    await getAuth(getAdminApp()).setCustomUserClaims(uid(key), { role: profile.role, accessRole: profile.accessRole, personas: profile.personas, primaryPortal: profile.primaryPortal });
  }
  assert.equal((await change('owner1', 'USER', tokens.staff)).success, false);
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const key of ['owner1', 'owner2']) assert.equal((await change(key, 'OWNER')).success, true);
    const results = await Promise.all([change('owner1', 'USER'), change('owner2', 'USER')]);
    assert.equal(results.filter(result => result.success).length, 1);
    assert.equal(results.filter(result => !result.success && result.message === 'Cannot remove the last owner.').length, 1);
    assert.equal((await db.collection('users').where('accessRole', '==', 'OWNER').get()).size, 1);
    for (const key of ['owner1', 'owner2']) {
      const profile = (await db.doc('users/' + uid(key)).get()).data()!;
      const claims = (await getAuth(getAdminApp()).getUser(uid(key))).customClaims!;
      assert.equal(claims.accessRole, profile.accessRole);
      assert.deepEqual(claims.personas, profile.personas);
    }
    assert.deepEqual((await db.doc('users/' + uid('owner1')).get()).data()!.personas, ['MARKETER']);
  }
});
