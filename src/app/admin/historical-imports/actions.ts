'use server';

import { createHash, randomUUID } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { adminDb, adminStorageBucket, getAdminApp } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import {
  HISTORICAL_IMPORT_SETTING_ID,
  hasBlockingHistoricalIssues,
  reconcileHistoricalExtraction,
  type HistoricalExtraction,
} from '@/lib/historical-import';
import { generateAmortizationSchedule } from '@/lib/amortization';
import { planRepaymentAllocations } from '@/lib/repayment-allocation';
import { historicalTimeline, historicalFundTimeline } from '@/lib/historical-timeline';
import { commitHistoricalWrites, assertHistoricalCorrectionApproval, type HistoricalWrite } from '@/lib/server/historical-corrections';
import { assertFinancialAiEnabled, financialAiEnabled } from '@/lib/server/financial-ai-policy';
import { HistoricalWorkspaceError, historicalWorkspaceResult } from '@/lib/server/historical-workspace-result';
import { historicalExtractionSchema as extractionSchema, historicalExtractionOutput, historicalExtractionForStorage } from '@/lib/server/historical-extraction-schema';
import { historicalExtractionPrompt, prepareHistoricalAiExtraction, historicalInvestmentBatch } from '@/lib/server/historical-investment-extraction';
import { beginHistoricalExtraction, finishHistoricalExtraction, failHistoricalExtraction, historicalAnalysisIsRunning } from '@/lib/server/historical-extraction-lock';
import { historicalIdentity, importedPartyRef, prepareRelatedParties, reconcileHistoricalRelationships, historicalDealRelationships, historicalDocumentRecipients, canonicalHistoricalAccounts } from '@/lib/historical-relationships';

const createSchema = z.object({
  authToken: z.string().min(1),
  partyMode: z.enum(['EXISTING', 'NEW']),
  existingUserId: z.string().optional(),
  partyKind: z.enum(['CLIENT', 'INVESTOR', 'BOTH']),
  partyName: z.string().trim().min(2),
  accountType: z.enum(['Individual', 'Organization']),
  asOfDate: z.string().date(),
}).superRefine((value, context) => {
  if (value.partyMode === 'EXISTING' && !value.existingUserId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['existingUserId'], message: 'Select an existing customer.' });
});

const MAX_DOCUMENTS_PER_IMPORT = 12;
const MAX_BATCH_WRITES = 450;

function normalizedIdentity(value: unknown) {
  return String(value || '').trim().toLocaleLowerCase('en-NG').replace(/\s+/g, ' ');
}

function plainTimestamp(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function serializeForClient(value: unknown): any {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeForClient);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, serializeForClient(nestedValue)]));
  }
  return value;
}

function serializeCase(snapshot: FirebaseFirestore.DocumentSnapshot): Record<string, any> {
  return { id: snapshot.id, ...serializeForClient(snapshot.data() || {}) };
}

async function assertImportEnabled() {
  const setting = await adminDb.collection('platformSettings').doc(HISTORICAL_IMPORT_SETTING_ID).get();
  if (setting.exists && setting.data()?.enabled === false) throw new HistoricalWorkspaceError('IMPORTS_CLOSED', 'Historical importing is closed. Re-enable imports on the migration page before continuing.');
}

export async function getHistoricalImportWorkspaceAction(authToken: string) {
  await verifyAdminWrite(authToken);
  const [cases, users, setting] = await Promise.all([
    adminDb.collection('historicalImports').orderBy('updatedAt', 'desc').limit(50).get(),
    adminDb.collection('users').orderBy('name').get(),
    adminDb.collection('platformSettings').doc(HISTORICAL_IMPORT_SETTING_ID).get(),
  ]);
  return {
    success: true as const,
    cases: cases.docs.map(serializeCase),
    financialAiEnabled: financialAiEnabled(),
    users: users.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, name: data.name || data.organizationName || 'Unnamed account', email: data.email || '', role: data.role || '', personas: data.personas || [], accountClaimStatus: data.accountClaimStatus || 'ACTIVE', accountType: data.accountType || 'Individual' };
    }),
    setting: { enabled: setting.data()?.enabled !== false, recordsAccurateThrough: plainTimestamp(setting.data()?.recordsAccurateThrough) },
  };
}

export async function createHistoricalImportAction(input: z.infer<typeof createSchema>) {
  return historicalWorkspaceResult(async () => {
    const values = createSchema.parse(input);
    const actor = await verifyAdminWrite(values.authToken);
    const setting = await adminDb.collection('platformSettings').doc(HISTORICAL_IMPORT_SETTING_ID).get();
    if (setting.data()?.enabled === false) throw new HistoricalWorkspaceError('IMPORTS_CLOSED', 'Historical importing is closed. Use “Re-enable imports” on the migration page before starting a new workspace.');
    if (values.partyMode === 'EXISTING') {
      const existing = await adminDb.collection('users').doc(values.existingUserId!).get();
      if (!existing.exists) throw new HistoricalWorkspaceError('CUSTOMER_NOT_FOUND', 'The selected customer no longer exists. Refresh the migration page and select another account.');
    } else {
      const normalizedPartyName = normalizedIdentity(values.partyName);
      const users = await adminDb.collection('users').select('name', 'organizationName', 'email', 'phoneNumber').get();
      const matchingUser = users.docs.find((document) => {
        const data = document.data();
        return normalizedIdentity(data.name) === normalizedPartyName || normalizedIdentity(data.organizationName) === normalizedPartyName;
      });
      if (matchingUser) {
        throw new HistoricalWorkspaceError('DUPLICATE_CUSTOMER', `An account named “${values.partyName}” already exists. Change Customer source to “Use existing client or investor” and select that account. If this is a different customer, enter their actual full name or organisation name.`, matchingUser.id);
      }
    }
    const ref = adminDb.collection('historicalImports').doc();
    await ref.set({
      partyMode: values.partyMode, existingUserId: values.partyMode === 'EXISTING' ? values.existingUserId : null, partyKind: values.partyKind, partyName: values.partyName,
      accountType: values.accountType, asOfDate: Timestamp.fromDate(new Date(`${values.asOfDate}T12:00:00Z`)), status: 'DRAFT', documents: [],
      extraction: null, reconciliationIssues: [], createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { importId: ref.id };
  });
}

export async function getHistoricalImportAction(authToken: string, importId: string) {
  await verifyAdminWrite(authToken);
  const snapshot = await adminDb.collection('historicalImports').doc(importId).get();
  if (!snapshot.exists) return { success: false as const, message: 'Import case not found.' };
  return { success: true as const, importCase: serializeCase(snapshot) };
}

export async function requestHistoricalCorrectionAction(input: {authToken:string; importId:string; reason:string; evidence:string}) {
  return historicalWorkspaceResult(async () => {
  const actor = await verifyAdminWrite(input.authToken);
  await assertImportEnabled();
  if (input.reason.trim().length < 10 || input.evidence.trim().length < 10) throw new HistoricalWorkspaceError('CORRECTION_EVIDENCE_REQUIRED','Explain the correction and identify the supporting documents (at least 10 characters each).');
  const sourceRef = adminDb.collection('historicalImports').doc(input.importId);
  const ref = adminDb.collection('historicalImports').doc();
  await adminDb.runTransaction(async transaction => {
    const source = await transaction.get(sourceRef);
    const data = source.data() || {};
    if (data.status !== 'POSTED' || data.supersededBy) throw new HistoricalWorkspaceError('CORRECTION_SOURCE_CHANGED','Open the latest posted revision to request a correction.');
    transaction.create(ref, { ...data, status:'DRAFT', partyMode:'EXISTING', existingUserId:data.postedPartyId, correctionSourceId:input.importId, correctionRootId:data.correctionRootId || input.importId, correctionRequestedBy:actor.uid, correctionReason:input.reason.trim(), correctionEvidence:input.evidence.trim(), postedAt:null, postedBy:null, supersededBy:null, postingStartedBy:null, postedPartyId:null, reconciliationIssues:[], createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp() });
  });
  return {success:true as const,importId:ref.id};
  });
}

export async function registerHistoricalDocumentAction(input: { authToken: string; importId: string; storagePath: string; originalName: string; contentType: string; size: number }) {
  const actor = await verifyAdminWrite(input.authToken);
  await assertImportEnabled();
  const prefix = `historical-imports/${input.importId}/${actor.uid}/`;
  if (!input.storagePath.startsWith(prefix)) throw new Error('Invalid historical document path.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(input.contentType) || input.size <= 0 || input.size > 5 * 1024 * 1024) throw new Error('Upload a JPG, PNG, WEBP or PDF no larger than 5 MB.');
  const ref = adminDb.collection('historicalImports').doc(input.importId);
  const snapshot = await ref.get();
  const existingDocuments = snapshot.data()?.documents || [];
  if (!snapshot.exists || snapshot.data()?.status === 'POSTED') throw new Error('This import cannot accept documents.');
  if (existingDocuments.length >= MAX_DOCUMENTS_PER_IMPORT) throw new Error(`Each import supports up to ${MAX_DOCUMENTS_PER_IMPORT} documents. Start another case for additional records.`);
  const storageFile = adminStorageBucket.file(input.storagePath);
  const [buffer] = await storageFile.download();
  const validMagic = input.contentType === 'application/pdf' ? buffer.subarray(0, 5).toString() === '%PDF-'
    : input.contentType === 'image/jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8
    : input.contentType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : input.contentType === 'image/webp' ? buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
    : false;
  if (!validMagic) {
    await storageFile.delete().catch(() => undefined);
    throw new Error('The file contents do not match the selected document type.');
  }
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const hashRef = adminDb.collection('historicalImportDocumentHashes').doc(sha256);
  const duplicate = await hashRef.get();
  if (duplicate.exists) {
    await storageFile.delete().catch(() => undefined);
    throw new Error(`This document was already uploaded in import ${duplicate.data()?.importId || 'another case'}.`);
  }
  const document = { id: randomUUID(), storagePath: input.storagePath, originalName: input.originalName.slice(0, 180), contentType: input.contentType, size: input.size, sha256, uploadedAt: Timestamp.now() };
  const write = adminDb.batch();
  write.create(hashRef, { importId: input.importId, storagePath: input.storagePath, createdAt: FieldValue.serverTimestamp() });
  write.update(ref, { documents: FieldValue.arrayUnion(document), status: 'DRAFT', extraction: null, reconciliationIssues: [], updatedAt: FieldValue.serverTimestamp() });
  try {
    await write.commit();
  } catch (error) {
    await storageFile.delete().catch(() => undefined);
    throw error;
  }
  return { success: true as const, document: { ...document, uploadedAt: document.uploadedAt.toDate().toISOString() } };
}

export async function getHistoricalDocumentPreviewAction(input: { authToken: string; importId: string; documentId: string }) {
  await verifyAdminWrite(input.authToken);
  const snapshot = await adminDb.collection('historicalImports').doc(input.importId).get();
  if (!snapshot.exists) throw new Error('Import case not found.');
  const document = (snapshot.data()?.documents || []).find((item: { id: string }) => item.id === input.documentId);
  if (!document) throw new Error('Document not found.');
  const [url] = await adminStorageBucket.file(document.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000 });
  return { success: true as const, url };
}

export async function setHistoricalDocumentVisibilityAction(input: { authToken: string; importId: string; documentId: string; customerVisible: boolean }) {
  await verifyAdminWrite(input.authToken);
  const ref = adminDb.collection('historicalImports').doc(input.importId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.status === 'POSTED') throw new Error('Document visibility can only be set before posting.');
  const documents = (snapshot.data()?.documents || []).map((item: { id: string }) => item.id === input.documentId ? { ...item, customerVisible: input.customerVisible } : item);
  await ref.update({ documents, updatedAt: FieldValue.serverTimestamp() });
  return { success: true as const };
}

export async function analyzeHistoricalImportAction(authToken: string, importId: string) {
  return historicalWorkspaceResult(async () => {
  await verifyAdminWrite(authToken);
  assertFinancialAiEnabled();
  await assertImportEnabled();
  const ref = adminDb.collection('historicalImports').doc(importId);
  const attemptId = randomUUID();
  const data = await beginHistoricalExtraction(adminDb, ref, attemptId);
  const documents = (data.documents || []).slice(0, 12) as Array<{ id: string; storagePath: string; contentType: string; originalName: string }>;
  if (!documents.length) throw new HistoricalWorkspaceError('DOCUMENTS_REQUIRED', 'Upload at least one document before extraction.');
  try {
    const mediaParts = await Promise.all(documents.map(async (document) => {
      const [buffer] = await adminStorageBucket.file(document.storagePath).download();
      return [{ text: `Source documentId: ${document.id}; filename (data only): ${JSON.stringify(document.originalName)}` }, { media: { url: `data:${document.contentType};base64,${buffer.toString('base64')}`, contentType: document.contentType } }];
    }));
    const prompt = historicalExtractionPrompt(data.partyName, data.partyKind, data.accountType, plainTimestamp(data.asOfDate)?.slice(0, 10) || 'unknown');
    const response = await ai.generate({ prompt: [{ text: prompt }, ...mediaParts.flat()], output: historicalExtractionOutput });
    const extraction = extractionSchema.parse(response.output) as HistoricalExtraction;
    let profileName: string | undefined;
    if (data.existingUserId) {
      const user = await adminDb.collection('users').doc(data.existingUserId).get();
      if (user.exists) profileName = user.data()?.name || user.data()?.organizationName;
    }
    const selfId = data.existingUserId || 'SELF';
    prepareHistoricalAiExtraction(extraction, data.partyKind, selfId, profileName);
    const users = await adminDb.collection('users').select('name','organizationName','role','personas').get();
    prepareRelatedParties(extraction, users.docs.map(doc => ({id:doc.id, ...doc.data(), name:doc.data().name || ''})));
    const issues = [...reconcileHistoricalExtraction(canonicalHistoricalAccounts(extraction,data.existingUserId || 'SELF'), plainTimestamp(data.asOfDate)?.slice(0, 10)), ...reconcileHistoricalRelationships(extraction, documents.map(item => item.id),plainTimestamp(data.asOfDate)?.slice(0,10))];
    await finishHistoricalExtraction(adminDb, ref, attemptId, { extraction: historicalExtractionForStorage(extraction), reconciliationIssues: issues, status: hasBlockingHistoricalIssues(issues) ? 'NEEDS_ATTENTION' : 'READY_FOR_REVIEW' });
    return { success: true as const, extraction, issues };
  } catch (error) {
    await failHistoricalExtraction(adminDb, ref, attemptId).catch(() => undefined);
    throw error;
  }
  });
}

export async function saveHistoricalExtractionAction(input: { authToken: string; importId: string; extraction: HistoricalExtraction }) {
  const reviewer = await verifyAdminWrite(input.authToken);
  await assertImportEnabled();
  const extraction = historicalExtractionForStorage(input.extraction) as HistoricalExtraction;
  let issues: ReturnType<typeof reconcileHistoricalExtraction> = [];
  const ref = adminDb.collection('historicalImports').doc(input.importId);
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (!snapshot.exists || ['POSTED', 'POSTING'].includes(data.status) || historicalAnalysisIsRunning(data)) throw new Error('This import cannot be edited while extraction or posting is running.');
    issues = [...reconcileHistoricalExtraction(canonicalHistoricalAccounts(extraction,data.existingUserId || 'SELF'), plainTimestamp(data.asOfDate)?.slice(0, 10)), ...reconcileHistoricalRelationships(extraction, (data.documents || []).map((item: {id:string}) => item.id),plainTimestamp(data.asOfDate)?.slice(0,10))];
    transaction.update(ref, { extraction, reconciliationIssues: issues, status: hasBlockingHistoricalIssues(issues) ? 'NEEDS_ATTENTION' : 'READY_FOR_REVIEW', processingState: 'REVIEWED', processingAttemptId: '', reviewedBy: reviewer.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  return { success: true as const, issues };
}

function rolesFor(kind: string) {
  const personas = kind === 'BOTH' ? ['CLIENT', 'INVESTOR'] : [kind];
  const role = kind === 'INVESTOR' ? 'Investor' : 'Client';
  return { personas, role, roles: kind === 'BOTH' ? ['Client', 'Investor'] : [role], primaryPortal: kind === 'INVESTOR' ? 'investor' : 'client' };
}

export async function postHistoricalImportAction(authToken: string, importId: string) {
  return historicalWorkspaceResult(async () => {
  const actor = await verifyAdminWrite(authToken);
  await assertImportEnabled();
  const importRef = adminDb.collection('historicalImports').doc(importId);
  const importSnapshot = await importRef.get();
  if (!importSnapshot.exists) throw new Error('Import case not found.');
  const importData = importSnapshot.data() || {};
  if (importData.correctionSourceId) assertHistoricalCorrectionApproval(importData.correctionRequestedBy,actor.uid,importData.correctionReason || '',importData.correctionEvidence || '');
  // Operational IDs remain stable; revised ledger entries get fresh revision IDs.
  function historicalDocumentId(caseId: string, ...parts: Array<string | number>) {
    const operational = ['deal','investment','fund-batch'].includes(String(parts[0]));
    const root = operational ? (importData.correctionRootId || caseId) : caseId;
    return `hist_${createHash('sha256').update([root,...parts].join('|')).digest('hex').slice(0,32)}`;
  }
  if (importData.status === 'POSTED') return { success: true as const, message: 'This import was already posted.', partyId: importData.postedPartyId };
  const extraction = extractionSchema.parse(importData.extraction) as HistoricalExtraction;
  const cutoff = plainTimestamp(importData.asOfDate)?.slice(0,10);
  if (extraction.deals.some(deal => deal.paymentEvidence?.some(payment => !cutoff || payment.date > cutoff))) throw new Error('Opening payment evidence cannot be dated after the financial snapshot date. Submit later receipts through bank reconciliation.');
  if (extraction.fundPositions.some(position => position.investmentTerms && (!cutoff || position.investmentTerms.paymentDate > cutoff))) throw new Error('An opening investment contribution cannot be dated after the snapshot date.');
  const issues = [...reconcileHistoricalExtraction(canonicalHistoricalAccounts(extraction,importData.existingUserId || 'SELF'), cutoff), ...reconcileHistoricalRelationships(extraction, (importData.documents || []).map((item: {id:string}) => item.id),cutoff)];
  if (hasBlockingHistoricalIssues(issues)) throw new HistoricalWorkspaceError('RECONCILIATION_REQUIRED','Resolve every red reconciliation issue before posting.');

  const estimatedWrites = 1 + (importData.existingUserId ? 0 : 1) + (extraction.relatedParties || []).filter(item => item.createNew).length
    + extraction.deals.reduce((count, deal) => count + 1 + deal.investors.length * 3 + (deal.amountPaid > 0 ? 2 * ((deal.paymentEvidence?.length || 0) + 1) + 1 : 0), 0)
    + extraction.fundPositions.reduce((count, position) => count + (position.transactions?.length || 0) + 5, 0)
    + extraction.expenses.filter((expense) => expense.amount > 0).length;
  if (estimatedWrites > MAX_BATCH_WRITES) throw new Error('This case contains too many records for one safe posting. Split it into smaller import cases.');

  let partyId = importData.existingUserId as string | undefined;
  const rootId = importData.correctionRootId || importId;
  const accountIds = new Map<string,string>();
  const customerProfiles = await adminDb.collection('users').select('name','organizationName','role','personas','accessRole','historicalImportId').get();
  for (const related of extraction.relatedParties || []) {
    if (related.createNew) {
      const uid = `hist_${createHash('sha256').update(`${rootId}|party|${related.id}`).digest('hex').slice(0,32)}`;
      const matches = customerProfiles.docs.filter(doc => [doc.data().name,doc.data().organizationName].some(name => name && historicalIdentity(name) === historicalIdentity(related.name)));
      if (matches.some(doc => doc.id !== uid)) throw new HistoricalWorkspaceError('DUPLICATE_CUSTOMER',`An account for ${related.name} already exists. Select it instead of creating a duplicate.`);
      accountIds.set(importedPartyRef(related.id),uid);
    } else accountIds.set(importedPartyRef(related.id),related.existingUserId!);
  }
  const verifyAccount = (ref: string | undefined, kind: 'CLIENT' | 'INVESTOR') => {
    if (!ref) throw new HistoricalWorkspaceError('ACCOUNT_LINK_REQUIRED',`Select a ${kind.toLowerCase()} account.`);
    if (ref === 'SELF') {
      if (![kind,'BOTH'].includes(importData.partyKind)) throw new HistoricalWorkspaceError('PARTY_ROLE_MISMATCH','The primary account has the wrong business relationship.');
      if (!importData.existingUserId) return;
      ref = String(importData.existingUserId);
    }
    if (ref === 'platform' && kind === 'INVESTOR') return;
    const related = (extraction.relatedParties || []).find(item => importedPartyRef(item.id) === ref);
    const id = accountIds.get(ref) || ref;
    if (related?.createNew && !customerProfiles.docs.some(doc => doc.id === id)) return;
    const profile = customerProfiles.docs.find(doc => doc.id === id)?.data();
    if (!profile || !(profile.personas?.includes(kind) || profile.role?.toUpperCase() === kind) || (profile.accessRole && profile.accessRole !== 'USER')) throw new HistoricalWorkspaceError('PARTY_ROLE_MISMATCH',`The selected account is not an eligible ${kind.toLowerCase()}. Choose the correct account; existing account roles are never changed by an import.`);
  };
  extraction.deals.forEach(deal => { verifyAccount(deal.clientId,'CLIENT'); deal.investors.forEach(item => verifyAccount(item.investorId,'INVESTOR')); });
  extraction.fundPositions.forEach(item => verifyAccount(item.investorId,'INVESTOR'));
  // Validate even unused related profiles; never promote existing customers implicitly.
  (extraction.relatedParties || []).forEach(item => (item.kind === 'BOTH' ? ['CLIENT','INVESTOR'] as const : [item.kind]).forEach(kind => verifyAccount(importedPartyRef(item.id),kind)));
  if (!partyId) {
    const normalizedPartyName = normalizedIdentity(extraction.party.name || importData.partyName);
    const users = await adminDb.collection('users').select('name', 'organizationName').get();
    const matchingUser = users.docs.find((document) => {
      const data = document.data();
      return normalizedIdentity(data.name) === normalizedPartyName || normalizedIdentity(data.organizationName) === normalizedPartyName;
    });
    if (matchingUser) throw new Error('A matching customer account was created after this draft. Link that account and review the case before posting.');
  }

  const acquiredPostingLock = await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(importRef);
    const currentData = current.data() || {};
    if (currentData.status === 'POSTED') return false;
    if (historicalAnalysisIsRunning(currentData)) throw new Error('Wait for extraction to finish before posting.');
    if (JSON.stringify(currentData.extraction) !== JSON.stringify(importData.extraction)) throw new Error('The review changed while posting was being prepared. Reload and approve the current review.');
    if (currentData.status === 'POSTING') {
      const startedAt = currentData.postingStartedAt instanceof Timestamp ? currentData.postingStartedAt.toMillis() : Date.now();
      if (Date.now() - startedAt < 15 * 60 * 1000) throw new Error('This import is already being posted. Wait for it to finish before retrying.');
    }
    transaction.update(importRef, { status: 'POSTING', postingStartedAt: FieldValue.serverTimestamp(), postingStartedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!acquiredPostingLock) return { success: true as const, message: 'This import was already posted.', partyId: importData.postedPartyId };

  let createdUnclaimedAuth = false;
  try {
    if (!partyId) {
      const historicalUid = `hist_${importId}`;
      const authRecord = await getAuth(getAdminApp()).getUser(historicalUid).catch(error => {
        if (error.code !== 'auth/user-not-found') throw error;
        return getAuth(getAdminApp()).createUser({ uid: historicalUid, displayName: extraction.party.name || importData.partyName, disabled: true });
      });
      partyId = authRecord.uid;
      createdUnclaimedAuth = true;
    }
    const writes: HistoricalWrite[] = [];
    const batch = {
      set(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) { writes.push({ref,data}); },
      update(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) { writes.push({ref,data,update:true}); },
    };
    const now = Timestamp.now();
    const resolveAccount = (ref: string | undefined) => ref === 'SELF' ? partyId : accountIds.get(ref || '') || ref;
    const roleModel = rolesFor(importData.partyKind);
    if (createdUnclaimedAuth) {
      batch.set(adminDb.collection('users').doc(partyId), {
        id: partyId, partyId, name: extraction.party.name || importData.partyName, email: '', pendingEmail: extraction.party.email || '', phoneNumber: extraction.party.phoneNumber || '',
        address: extraction.party.address || '', accountType: extraction.party.accountType || importData.accountType, organizationName: extraction.party.accountType === 'Organization' ? extraction.party.name : '',
        organizationRegistrationNumber: extraction.party.organizationRegistrationNumber || '', bankName: extraction.party.bankName || '', bankAccountName: extraction.party.bankAccountName || '',
        representativeName: extraction.party.representativeName || '', representativeTitle: extraction.party.representativeTitle || '',
        bankAccountNumber: '', bankAccountNumberLast4: extraction.party.bankAccountNumberLast4 || '', ...(typeof extraction.party.isMuslim === 'boolean' ? { isMuslim: extraction.party.isMuslim } : {}),
        accessRole: 'USER', ...roleModel, accountClaimStatus: 'UNCLAIMED', historicalImportId: importId, createdAt: now,
      });
    }

    for (const related of extraction.relatedParties || []) {
      if (!related.createNew) continue;
      const uid = accountIds.get(importedPartyRef(related.id))!;
      if (customerProfiles.docs.some(doc => doc.id === uid)) continue; // corrections never overwrite a claimed profile
      await getAuth(getAdminApp()).getUser(uid).catch(error => {
        if (error.code !== 'auth/user-not-found') throw error;
        return getAuth(getAdminApp()).createUser({uid,displayName:related.name,disabled:true});
      });
      batch.set(adminDb.collection('users').doc(uid), {
        id:uid, partyId:uid, name:related.name, email:'', pendingEmail:related.email || '', phoneNumber:related.phoneNumber || '', address:related.address || '',
        accountType:related.accountType, organizationName:related.accountType === 'Organization' ? related.name : '', organizationRegistrationNumber:related.organizationRegistrationNumber || '',
        representativeName:related.representativeName || '', representativeTitle:related.representativeTitle || '',
        bankName:related.bankName || '', bankAccountName:related.bankAccountName || '', bankAccountNumber:'', bankAccountNumberLast4:related.bankAccountNumberLast4 || '',
        accessRole:'USER', ...rolesFor(related.kind), accountClaimStatus:'UNCLAIMED', historicalImportId:importId,createdAt:now,
      });
    }

    for (const [dealIndex, deal] of extraction.deals.entries()) {
      const dealRef = adminDb.collection('deals').doc(historicalDocumentId(importId, 'deal', deal.id || dealIndex));
      const clientId = resolveAccount(deal.clientId);
      if (!clientId) throw new Error(`${deal.dealName} must be linked to an existing client before posting.`);
      const startDate = Timestamp.fromDate(new Date(`${deal.startDate}T12:00:00Z`));
      const dealData = {
        dealName: deal.dealName, clientId, clientName: deal.clientName || extraction.party.name, principal: deal.principal, profitRate: deal.profitRate,
        managementFeeRate: 0, managementFeeAmount: deal.managementFeeAmount, managementFeePaid: true, requiresManagementFee: false,
        agreementSigningRequired: false, agreementSigningWaived: true, agreementSigningWaivedBy: actor.uid, agreementSigningWaivedAt: now,
        financingMode: deal.financingMode, durationValue: Math.max(1, Math.round(deal.durationValue)), durationUnit: deal.durationUnit,
        repaymentType: 'Equal Installments', repaymentFrequency: deal.repaymentFrequency, status: deal.state === 'COMPLETED' ? 'Completed' : 'Active',
        createdAt: now, startDate, ...(deal.completionDate ? { completedAt: Timestamp.fromDate(new Date(`${deal.completionDate}T12:00:00Z`)) } : {}),
        historicalImport: true, historicalImportId: importId, importedAsOfDate: importData.asOfDate,
        legacyPaymentEvidence: deal.paymentEvidence || [],
        ...historicalDealRelationships(extraction,deal.id),
      };
      batch.set(dealRef, dealData);
      for (const [investorIndex, investor] of deal.investors.entries()) {
        const investorId = resolveAccount(investor.investorId);
        if (!investorId) throw new Error(`Link investor ${investor.investorName} to an existing or imported investor before posting.`);
        const positionIndexes = extraction.fundPositions.map((position, index) => ({ position, index })).filter(({ position }) => resolveAccount(position.investorId) === investorId && (!investor.fundPositionId || position.id === investor.fundPositionId));
        if (positionIndexes.length > 1) throw new Error('Select the original investment contract for this funding allocation.');
        const sourceBatchId = positionIndexes.length === 1 ? historicalDocumentId(importId, 'fund-batch', positionIndexes[0].index) : undefined;
        const investmentRef = adminDb.collection('investments').doc(historicalDocumentId(importId, 'investment', deal.id || dealIndex, investorIndex));
        batch.set(investmentRef, { investorId, dealId: dealRef.id, amount: investor.amountInvested, ...(sourceBatchId ? { fundBatchId: sourceBatchId } : {}), createdAt: startDate, historicalImport: true, historicalImportId: importId });
        batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'investment-transaction', deal.id || dealIndex, investorIndex)), { userId: investorId, dealId: dealRef.id, investmentId: investmentRef.id, type: 'Investment', amount: -investor.amountInvested, createdAt: startDate, dealName: deal.dealName, historicalImport: true, historicalImportId: importId });
        if (investor.realisedProfit > 0 && investorId !== 'platform') {
          if (!sourceBatchId) throw new Error('Include the investor fund position and original contract so historical profit retains its withdrawal restrictions.');
          const datedProfit = (positionIndexes[0].position.transactions || []).filter(entry => entry.type === 'ProfitDistribution' && entry.dealId === deal.id);
          for (const [entryIndex, entry] of historicalTimeline(investor.realisedProfit, datedProfit, cutoff!).entries()) {
            const date = Timestamp.fromDate(new Date(`${entry.date}T12:00:00Z`));
            batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'profit', deal.id || dealIndex, investorIndex, entryIndex)), { userId: investorId, dealId: dealRef.id, fundBatchId: sourceBatchId, type: 'ProfitDistribution', amount: entry.amount, createdAt: date, profitEarnedAt: date, dealName: deal.dealName, paymentReference: entry.reference, sourceDocumentName: entry.documentName, historicalOpeningBalance: entry.openingBalance, historicalImport: true, historicalImportId: importId });
          }
        }
      }
      if (deal.amountPaid > 0) {
        const schedule = generateAmortizationSchedule({ id: dealRef.id, ...dealData } as any);
        const approvedRepayments: any[] = [];
        const applied = { principal: 0, profit: 0 };
        for (const [entryIndex, entry] of historicalTimeline(deal.amountPaid, deal.paymentEvidence || [], cutoff!).entries()) {
          const allocations = planRepaymentAllocations({ amount: entry.amount, startingInstallment: 1, schedule, approvedRepayments });
          const components = allocations.reduce((sum, item) => ({ principal: sum.principal + item.principalApplied, profit: sum.profit + item.interestApplied }), { principal: 0, profit: 0 });
          applied.principal += components.principal; applied.profit += components.profit;
          const date = Timestamp.fromDate(new Date(`${entry.date}T12:00:00Z`));
          const repayment = { dealId: dealRef.id, clientId, amount: entry.amount, status: 'Approved', lodgedAt: date, dueDate: date, installmentNumber: 1, allocations, principalApplied: components.principal, interestApplied: components.profit, approvedAt: now, paymentReference: entry.reference, sourceDocumentName: entry.documentName, historicalOpeningBalance: entry.openingBalance, historicalImport: true, historicalImportId: importId };
          approvedRepayments.push(repayment);
          batch.set(adminDb.collection('repayments').doc(historicalDocumentId(importId, 'repayment', deal.id || dealIndex, entryIndex)), repayment);
          batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'repayment-transaction', deal.id || dealIndex, entryIndex)), { userId: clientId, dealId: dealRef.id, type: 'Repayment', amount: -entry.amount, createdAt: date, dealName: deal.dealName, paymentReference: entry.reference, sourceDocumentName: entry.documentName, historicalOpeningBalance: entry.openingBalance, historicalImport: true, historicalImportId: importId });
        }
        const declaredInvestorProfit = deal.investors.reduce((sum, item) => item.investorId === 'platform' ? sum : sum + item.realisedProfit, 0);
        const platformProfit = Math.max(0, Math.round((applied.profit - declaredInvestorProfit) * 100) / 100);
        if (platformProfit > 0) batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'platform-profit', deal.id || dealIndex)), { userId: 'platform', dealId: dealRef.id, type: 'PlatformEarning', amount: platformProfit, createdAt: importData.asOfDate, dealName: deal.dealName, ownerAllocatable: false, platformEarningKind: 'HistoricalOpening', historicalImport: true, historicalImportId: importId });
      }
    }

    for (const [positionIndex, position] of extraction.fundPositions.entries()) {
      const investorId = resolveAccount(position.investorId);
      if (!investorId) throw new Error(`Link fund position for ${position.investorName} before posting.`);
      for (const type of ['Deposit', 'Withdrawal', 'PrincipalReturn'] as const) {
        for (const [entryIndex, entry] of historicalFundTimeline(position, type, cutoff!).entries()) {
          batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'fund-history', positionIndex, type, entryIndex)), { userId: investorId, fundBatchId: historicalDocumentId(importId, 'fund-batch', positionIndex), type, amount: entry.amount * (type === 'Withdrawal' ? -1 : 1), createdAt: Timestamp.fromDate(new Date(`${entry.date}T12:00:00Z`)), paymentReference: entry.reference, sourceDocumentName: entry.documentName, historicalOpeningBalance: entry.openingBalance, historicalImport: true, historicalImportId: importId });
        }
      }
      const investmentBatch = historicalInvestmentBatch(position);
      batch.set(adminDb.collection('fundBatches').doc(historicalDocumentId(importId, 'fund-batch', positionIndex)), {
        ...investmentBatch, sourceId: investorId,
        agreementDate: Timestamp.fromDate(new Date(`${investmentBatch.agreementDate}T00:00:00+01:00`)),
        paymentDate: Timestamp.fromDate(new Date(`${investmentBatch.paymentDate}T00:00:00+01:00`)),
        principalLockedUntil: Timestamp.fromDate(investmentBatch.principalLockedUntil),
        createdAt: Timestamp.fromDate(new Date(`${investmentBatch.paymentDate}T00:00:00+01:00`)),
        importedAt: now, historicalImport: true, historicalImportId: importId,
        historicalAgreements:(extraction.agreementLinks || []).filter(item => item.type === 'MUDARABA' && item.fundPositionId === position.id),
      });
    }
    for (const [expenseIndex, expense] of extraction.expenses.entries()) {
      if (expense.amount <= 0) continue;
      batch.set(adminDb.collection('administrativeTransactions').doc(historicalDocumentId(importId, 'expense', expenseIndex)), { type: 'Expense', amount: -Math.abs(expense.amount), description: expense.description || 'Historical expense', reference: expense.reference || null, createdAt: expense.date ? Timestamp.fromDate(new Date(`${expense.date}T12:00:00Z`)) : importData.asOfDate, historicalImport: true, historicalImportId: importId });
    }
    const documents = (importData.documents || []).map((document: {id:string}) => {
      return {...document,recipientUserIds:historicalDocumentRecipients(extraction,document.id,resolveAccount)};
    });
    batch.update(importRef, { status: 'POSTED', postedAt: now, postedBy: actor.uid, postedPartyId: partyId, postedPartyIds:[...new Set([partyId,...accountIds.values(),...extraction.deals.map(item => resolveAccount(item.clientId)),...extraction.fundPositions.map(item => resolveAccount(item.investorId))].filter(Boolean))], documents, reconciliationIssues: issues, updatedAt: now });
    await commitHistoricalWrites(adminDb,writes,{importId,sourceId:importData.correctionSourceId,actor:actor.uid});
    return { success: true as const, message: 'Historical records posted successfully.', partyId };
  } catch (error) {
    await importRef.set({ status: 'NEEDS_ATTENTION', postingError: error instanceof Error ? error.message : 'Posting failed.', updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    throw error;
  }
  });
}

export async function setHistoricalImportAvailabilityAction(input: { authToken: string; enabled: boolean; recordsAccurateThrough?: string }) {
  const actor = await verifyAdminWrite(input.authToken);
  await adminDb.collection('platformSettings').doc(HISTORICAL_IMPORT_SETTING_ID).set({
    enabled: input.enabled,
    ...(input.recordsAccurateThrough ? { recordsAccurateThrough: Timestamp.fromDate(new Date(`${input.recordsAccurateThrough}T12:00:00Z`)) } : {}),
    updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
  }, { merge: true });
  return { success: true as const };
}
