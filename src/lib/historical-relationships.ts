import type { HistoricalExtraction, ReconciliationIssue } from './historical-import';

export const historicalIdentity = (value: string) => value.trim().toLocaleLowerCase('en-NG').replace(/\s+/g, ' ');
export const importedPartyRef = (id: string) => `IMPORT:${id}`;
const companyNames = new Set(['nal','nal general merchant ltd','nal general merchant limited','nal platform capital','platform']);

export function historicalAccountKey(extraction: HistoricalExtraction, ref?: string, selfId = 'SELF') {
  if (ref === 'SELF') return selfId;
  const party = (extraction.relatedParties || []).find(item => importedPartyRef(item.id) === ref);
  return party && !party.createNew ? party.existingUserId || ref : ref;
}
export function canonicalHistoricalAccounts(extraction: HistoricalExtraction, selfId = 'SELF'): HistoricalExtraction {
  return {...extraction,
    deals:extraction.deals.map(deal=>({...deal,clientId:historicalAccountKey(extraction,deal.clientId,selfId),investors:deal.investors.map(item=>({...item,investorId:historicalAccountKey(extraction,item.investorId,selfId)}))})),
    fundPositions:extraction.fundPositions.map(item=>({...item,investorId:historicalAccountKey(extraction,item.investorId,selfId)})),
  };
}

export function reconcileHistoricalRelationships(extraction: HistoricalExtraction, documentIds?: string[], cutoff?: string): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const error = (code: string, message: string) => issues.push({ code, message, severity: 'ERROR' });
  const parties = extraction.relatedParties || [];
  if (extraction.party.accountType === 'Organization' && !extraction.party.representativeName?.trim()) error('REPRESENTATIVE_REQUIRED','Identify the primary organisation’s authorised representative.');
  const ids = new Set<string>();
  const names = new Set<string>([historicalIdentity(extraction.party.name)]);
  for (const party of parties) {
    if (!/^[\w-]{1,80}$/.test(party.id) || ids.has(party.id)) error('PARTY_ID_INVALID', 'Each related customer needs a unique identifier.');
    ids.add(party.id);
    const name = historicalIdentity(party.name);
    if (!name || names.has(name)) error('DUPLICATE_RELATED_PARTY', 'Use one account entry per customer, including the primary account.');
    names.add(name);
    if (!party.confirmed || (party.createNew ? Boolean(party.existingUserId) : !party.existingUserId)) error('PARTY_REVIEW_REQUIRED', `Confirm whether ${party.name || 'this customer'} uses an existing account or a new unclaimed profile.`);
    if (party.accountType === 'Organization' && !party.representativeName?.trim()) error('REPRESENTATIVE_REQUIRED', `Identify the individual representing ${party.name}.`);
  }
  const checkRef = (ref: string | undefined, kind: 'CLIENT' | 'INVESTOR') => {
    if (!ref?.startsWith('IMPORT:')) return;
    const party = parties.find(item => importedPartyRef(item.id) === ref);
    if (!party || ![kind, 'BOTH'].includes(party.kind)) error('PARTY_REFERENCE_INVALID', `Select a reviewed ${kind.toLowerCase()} account for each financial record.`);
  };
  extraction.deals.forEach(deal => { checkRef(deal.clientId, 'CLIENT'); deal.investors.forEach(item => checkRef(item.investorId, 'INVESTOR')); });
  extraction.fundPositions.forEach(item => checkRef(item.investorId, 'INVESTOR'));
  const links = extraction.agreementLinks || [];
  const linkIds = new Set<string>();
  for (const link of links) {
    if (!link.id || linkIds.has(link.id)) error('AGREEMENT_ID_INVALID', 'Each agreement entry needs a unique identifier.');
    linkIds.add(link.id);
    if (!link.documentId || (documentIds && !documentIds.includes(link.documentId))) error('AGREEMENT_SOURCE_REQUIRED', 'Select an uploaded source file for every agreement.');
    if (!link.confirmed || !link.evidence.trim()) error('AGREEMENT_REVIEW_REQUIRED', 'Confirm each document classification and explain its relationship (or why it is unrelated).');
    if (link.type === 'MUDARABA') {
      if (!extraction.fundPositions.some(item => item.id === link.fundPositionId)) error('AGREEMENT_FUND_REQUIRED', 'Link each investor Mudaraba agreement to its original fund contract.');
      if (link.dealId) error('AGREEMENT_WRONG_LINK', 'Investor Mudaraba agreements link to fund contracts, not client deals.');
    } else if (['MURABAHA', 'WAKALAH', 'KAFAALAH'].includes(link.type)) {
      const deal = extraction.deals.find(item => item.id === link.dealId);
      if (!deal || (['MURABAHA', 'WAKALAH'].includes(link.type) && deal.financingMode !== 'Murabaha')) error('AGREEMENT_DEAL_REQUIRED', 'Link every sales, agency or guarantee agreement to the correct compatible deal.');
      if (link.fundPositionId) error('AGREEMENT_WRONG_LINK', 'Client agreements link to a deal, not a fund contract.');
      if (link.type === 'KAFAALAH' && !link.guarantorName.trim()) error('GUARANTOR_REQUIRED', 'Confirm the guarantor named in every Kafaalah bond.');
    } else if (link.dealId || link.fundPositionId) error('AGREEMENT_WRONG_LINK', 'Supporting documents cannot grant agency or guarantee rights.');
    if (link.date && (!/^\d{4}-\d{2}-\d{2}$/.test(link.date) || !Number.isFinite(Date.parse(link.date)) || new Date(link.date).toISOString().slice(0,10) !== link.date || (cutoff && link.date > cutoff))) error('AGREEMENT_DATE_INVALID', 'Correct the agreement date; historical evidence cannot be dated after the snapshot cutoff.');
  }
  if (documentIds) for (const id of documentIds) {
    if (!links.some(link => link.documentId === id)) error('DOCUMENT_CLASSIFICATION_REQUIRED', 'Classify every uploaded file, including receipts/supporting documents, before posting.');
  }
  if (documentIds) for (const deal of extraction.deals.filter(item => item.state === 'ONGOING')) {
    if (!links.some(link => link.type === 'KAFAALAH' && link.dealId === deal.id && link.confirmed)) error('ONGOING_GUARANTEE_REQUIRED', `${deal.dealName} is ongoing: attach and verify its Kafaalah guarantor evidence.`);
  }
  for (const deal of extraction.deals) {
    const agencies = links.filter(link => link.type === 'WAKALAH' && link.dealId === deal.id);
    if (new Set(agencies.map(link => `${link.assetDescription}|${link.supplierName}`)).size > 1) error('CONFLICTING_AGENCY_DOCUMENTS','Resolve conflicting Wakalah asset/supplier details for a deal before posting.');
  }
  return issues;
}

// Model output cannot choose production account IDs or approve its own proposals.
export function prepareRelatedParties(extraction: HistoricalExtraction, users: Array<{id: string; name: string; organizationName?: string; role?: string; personas?: string[] }>) {
  const parties = (extraction.relatedParties || []).filter(party => historicalIdentity(party.name) !== historicalIdentity(extraction.party.name) && !companyNames.has(historicalIdentity(party.name)));
  const discover = (name: string, kind: 'CLIENT' | 'INVESTOR', alreadyLinked?: string) => {
    if (!name.trim() || alreadyLinked || companyNames.has(historicalIdentity(name)) || historicalIdentity(name) === historicalIdentity(extraction.party.name)) return;
    const existing = parties.find(party => historicalIdentity(party.name) === historicalIdentity(name));
    if (existing) { if (existing.kind !== kind) existing.kind = 'BOTH'; return; }
    parties.push({ id: `party-${parties.length + 1}`, name, kind, accountType: 'Individual', createNew: false, confirmed: false });
  };
  extraction.deals.forEach(deal => { discover(deal.clientName, 'CLIENT', deal.clientId); deal.investors.forEach(item => discover(item.investorName, 'INVESTOR', item.investorId)); });
  extraction.fundPositions.forEach(item => discover(item.investorName, 'INVESTOR', item.investorId));
  extraction.relatedParties = parties;
  for (const party of parties) {
    delete party.isMuslim;
    const candidates = users.filter(user => [user.name, user.organizationName || ''].some(name => historicalIdentity(name) === historicalIdentity(party.name)) &&
      (party.kind === 'BOTH' ? ['CLIENT', 'INVESTOR'] : [party.kind]).every(kind => user.personas?.includes(kind) || user.role?.toUpperCase() === kind));
    party.existingUserId = candidates.length === 1 ? candidates[0].id : '';
    party.createNew = false;
    party.confirmed = false;
  }
  const refFor = (name: string, kind: string) => {
    const matches = parties.filter(party => historicalIdentity(party.name) === historicalIdentity(name) && [kind, 'BOTH'].includes(party.kind));
    return matches.length === 1 ? importedPartyRef(matches[0].id) : undefined;
  };
  extraction.deals.forEach(deal => {
    deal.clientId ||= refFor(deal.clientName, 'CLIENT');
    deal.investors.forEach(investor => { investor.investorId ||= refFor(investor.investorName, 'INVESTOR'); });
  });
  extraction.fundPositions.forEach(position => { position.investorId ||= refFor(position.investorName, 'INVESTOR'); });
  (extraction.agreementLinks || []).forEach(link => { link.confirmed = false; });
}

export function historicalDealRelationships(extraction: HistoricalExtraction, dealId: string) {
  const links = (extraction.agreementLinks || []).filter(link => link.dealId === dealId && link.confirmed);
  const agency = links.find(link => link.type === 'WAKALAH');
  const guarantees = links.filter(link => link.type === 'KAFAALAH');
  const guarantor = guarantees[0];
  return {
    historicalAgreements: links, wakalahGranted: Boolean(agency), historicalGuarantees: guarantees,
    ...(agency ? { wakalahAssetDescription: agency.assetDescription, wakalahSupplierName: agency.supplierName } : {}),
    ...(guarantor ? { guarantorName: guarantor.guarantorName, guarantorAddress: guarantor.guarantorAddress, guarantorPhoneNumber: guarantor.guarantorPhoneNumber, guarantorOccupation: guarantor.guarantorOccupation } : {}),
  };
}

export function historicalDocumentRecipients(extraction: HistoricalExtraction, documentId: string, resolve: (ref?:string)=>string | undefined) {
  const links = (extraction.agreementLinks || []).filter(link => link.documentId === documentId);
  const recipients = links.flatMap(link => link.type === 'MUDARABA'
    ? [resolve(extraction.fundPositions.find(item => item.id === link.fundPositionId)?.investorId)]
    : link.dealId ? [resolve(extraction.deals.find(item => item.id === link.dealId)?.clientId)] : []);
  const unique = [...new Set(recipients.filter((id):id is string => Boolean(id)))];
  return unique.length === 1 ? unique : [];
}

export function canReadHistoricalDocument(document: {customerVisible?:boolean;recipientUserIds?:string[]}, primaryId:string, viewerId:string) {
  return document.customerVisible === true && (document.recipientUserIds ? document.recipientUserIds.includes(viewerId) : primaryId === viewerId);
}
