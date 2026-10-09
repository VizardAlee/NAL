import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalBundle } from './fixtures/historical-bundle';
import { canReadHistoricalDocument, canonicalHistoricalAccounts, historicalDealRelationships, historicalDocumentRecipients, prepareRelatedParties, reconcileHistoricalRelationships } from '../src/lib/historical-relationships';
import { reconcileHistoricalExtraction } from '../src/lib/historical-import';
import { prepareHistoricalAiExtraction, historicalExtractionPrompt } from '../src/lib/server/historical-investment-extraction';

const documentIds = ['doc-investor','doc-sale','doc-agency','doc-guarantee'];
test('mixed investor, sale, agency and guarantee bundle reconciles without double-counting',()=>{
  const bundle=historicalBundle();
  assert.deepEqual(reconcileHistoricalExtraction(bundle).filter(item=>item.severity==='ERROR'),[]);
  assert.deepEqual(reconcileHistoricalRelationships(bundle,documentIds),[]);
  const deal=historicalDealRelationships(bundle,'sale-a');
  assert.equal(deal.wakalahGranted,true);
  assert.equal(deal.guarantorName,'Synthetic Guarantor');
  assert.equal(deal.historicalGuarantees.length,1);
  assert.equal(bundle.deals.length,1);
  assert.equal(bundle.deals[0].amountPaid,0);
});
test('AI proposals cannot approve people, choose arbitrary accounts or grant agency',()=>{
  const bundle=historicalBundle();
  bundle.relatedParties![0].existingUserId='invented-admin';
  bundle.relatedParties![0].isMuslim=true;
  prepareHistoricalAiExtraction(bundle,'INVESTOR','SELF');
  prepareRelatedParties(bundle,[{id:'existing-client',name:'Legacy Organisation',personas:['CLIENT']}]);
  assert.equal(bundle.relatedParties![0].existingUserId,'existing-client');
  assert.equal(bundle.relatedParties![0].createNew,false);
  assert.equal(bundle.relatedParties![0].confirmed,false);
  assert.equal(bundle.relatedParties![0].isMuslim,undefined);
  assert.equal(bundle.deals[0].clientId,'IMPORT:customer-a');
  assert.equal(historicalDealRelationships(bundle,'sale-a').wakalahGranted,false);
  assert.ok(reconcileHistoricalRelationships(bundle,documentIds).some(item=>item.code==='PARTY_REVIEW_REQUIRED'));
});
test('missing related people are discovered once and ambiguous name matches are never auto-selected',()=>{
  const bundle=historicalBundle();bundle.relatedParties=[];
  prepareHistoricalAiExtraction(bundle,'INVESTOR','SELF');
  prepareRelatedParties(bundle,[{id:'a',name:'Legacy Organisation',role:'Client'},{id:'b',name:'Legacy Organisation',role:'Client'}]);
  assert.equal(bundle.relatedParties.length,1);
  assert.equal(bundle.relatedParties[0].existingUserId,'');
  assert.equal(bundle.relatedParties[0].createNew,false);
});
test('invalid document, wrong contract, missing guarantor and unreviewed links block posting',()=>{
  for (const change of [
    (b:ReturnType<typeof historicalBundle>)=>{b.agreementLinks![0].documentId='invented';},
    (b:ReturnType<typeof historicalBundle>)=>{b.agreementLinks![0].fundPositionId='wrong';},
    (b:ReturnType<typeof historicalBundle>)=>{b.agreementLinks![2].dealId='wrong';},
    (b:ReturnType<typeof historicalBundle>)=>{b.agreementLinks![3].guarantorName='';},
    (b:ReturnType<typeof historicalBundle>)=>{b.agreementLinks![3].confirmed=false;},
    (b:ReturnType<typeof historicalBundle>)=>{b.relatedParties![0].representativeName='';},
    (b:ReturnType<typeof historicalBundle>)=>{b.deals[0].clientId='IMPORT:missing';},
  ]) {const bundle=historicalBundle();change(bundle);assert.ok(reconcileHistoricalRelationships(bundle,documentIds).length>0);}
});
test('unclassified sources and ongoing deals without guarantees block; historical completion is preserved',()=>{
  const bundle=historicalBundle();bundle.agreementLinks=bundle.agreementLinks!.filter(item=>item.type!=='KAFAALAH');
  assert.ok(reconcileHistoricalRelationships(bundle,documentIds).some(item=>item.code==='ONGOING_GUARANTEE_REQUIRED'));
  bundle.deals[0].state='COMPLETED';
  assert.equal(reconcileHistoricalRelationships(bundle,documentIds.slice(0,3)).some(item=>item.code==='ONGOING_GUARANTEE_REQUIRED'),false);
});
test('existing-account aliases reconcile funding without mutating reviewed account choices',()=>{
  const bundle=historicalBundle();
  bundle.relatedParties!.push({id:'other-investor',name:'Other Investor',kind:'INVESTOR',accountType:'Individual',existingUserId:'real-investor',createNew:false,confirmed:true});
  bundle.deals[0].investors[0].investorId='IMPORT:other-investor';bundle.fundPositions[0].investorId='real-investor';
  const canonical=canonicalHistoricalAccounts(bundle);
  assert.equal(canonical.deals[0].investors[0].investorId,'real-investor');
  assert.equal(bundle.deals[0].investors[0].investorId,'IMPORT:other-investor');
});
test('documents are scoped to the right account; multi-customer PDFs and supporting evidence stay private',()=>{
  const bundle=historicalBundle();
  const resolve=(ref?:string)=>ref==='SELF'?'investor':ref==='IMPORT:customer-a'?'client':ref;
  assert.deepEqual(historicalDocumentRecipients(bundle,'doc-investor',resolve),['investor']);
  assert.deepEqual(historicalDocumentRecipients(bundle,'doc-guarantee',resolve),['client']);
  bundle.agreementLinks![0].documentId='doc-sale';
  assert.deepEqual(historicalDocumentRecipients(bundle,'doc-sale',resolve),[]);
  assert.deepEqual(historicalDocumentRecipients(bundle,'unknown',resolve),[]);
  assert.equal(canReadHistoricalDocument({customerVisible:true,recipientUserIds:['client']},'investor','investor'),false);
  assert.equal(canReadHistoricalDocument({customerVisible:true,recipientUserIds:['client']},'investor','client'),true);
  assert.equal(canReadHistoricalDocument({customerVisible:false,recipientUserIds:['client']},'investor','client'),false);
  assert.equal(canReadHistoricalDocument({customerVisible:true},'investor','investor'),true);
});
test('relationship prompt excludes invented funding, guarantor accounts and signatures',()=>{
  const prompt=historicalExtractionPrompt('Primary','INVESTOR','Individual','2026-09-30');
  assert.match(prompt,/NOT a separate financing deal or payment/);
  assert.match(prompt,/excluding NAL, guarantors\/witnesses/);
  assert.match(prompt,/Funding allocation still requires explicit evidence/);
});
test('duplicate party names, conflicting agency documents and invalid dates fail closed',()=>{
  const bundle=historicalBundle();
  bundle.relatedParties!.push({...bundle.relatedParties![0],id:'duplicate',name:' legacy  organisation '});
  bundle.agreementLinks!.push({...bundle.agreementLinks![2],id:'conflicting-agency',supplierName:'Different Supplier'});
  bundle.agreementLinks![0].date='2026-02-31';
  const codes=reconcileHistoricalRelationships(bundle,documentIds).map(item=>item.code);
  for (const code of ['DUPLICATE_RELATED_PARTY','CONFLICTING_AGENCY_DOCUMENTS','AGREEMENT_DATE_INVALID']) assert.ok(codes.includes(code));
  bundle.agreementLinks![0].date='2026-10-01';
  assert.ok(reconcileHistoricalRelationships(bundle,documentIds,'2026-09-30').some(item=>item.code==='AGREEMENT_DATE_INVALID'));
});
