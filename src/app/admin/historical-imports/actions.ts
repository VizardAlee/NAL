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

const partySchema = z.object({
  name: z.string().default(''), email: z.string().default(''), phoneNumber: z.string().default(''), address: z.string().default(''),
  accountType: z.enum(['Individual', 'Organization']).default('Individual'), organizationRegistrationNumber: z.string().default(''),
  bankName: z.string().default(''), bankAccountName: z.string().default(''), bankAccountNumberLast4: z.string().default(''), isMuslim: z.boolean().optional(),
});
const investorAllocationSchema = z.object({
  investorId: z.string().optional(), investorName: z.string().default(''), amountInvested: z.number().default(0), realisedProfit: z.number().default(0), principalReturned: z.number().default(0),
});
const dealSchema = z.object({
  id: z.string().default(''), dealName: z.string().default(''), clientId: z.string().optional(), clientName: z.string().default(''),
  state: z.enum(['ONGOING', 'COMPLETED']).default('ONGOING'), financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']).default('Murabaha'),
  principal: z.number().default(0), profitRate: z.number().default(0), managementFeeAmount: z.number().default(0), startDate: z.string().default(''), completionDate: z.string().optional(),
  durationValue: z.number().default(0), durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']).default('Months'),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']).default('Monthly'), amountPaid: z.number().default(0), documentedOutstanding: z.number().default(0),
  investors: z.array(investorAllocationSchema).default([]),
});
const extractionSchema = z.object({
  party: partySchema,
  deals: z.array(dealSchema).default([]),
  fundPositions: z.array(z.object({
    investorId: z.string().optional(), investorName: z.string().default(''), totalDeposited: z.number().default(0), totalAllocated: z.number().default(0),
    totalWithdrawn: z.number().default(0), principalReturned: z.number().default(0), realisedProfit: z.number().default(0), availableCapital: z.number().default(0),
  })).default([]),
  expenses: z.array(z.object({ description: z.string().default(''), amount: z.number().default(0), date: z.string().optional(), reference: z.string().optional() })).default([]),
  notes: z.array(z.string()).default([]), confidence: z.number().min(0).max(1).default(0),
});

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

function historicalDocumentId(...parts: Array<string | number>) {
  return `hist_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)}`;
}

function plainTimestamp(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function serializeCase(snapshot: FirebaseFirestore.DocumentSnapshot): Record<string, any> {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    ...data,
    createdAt: plainTimestamp(data.createdAt),
    updatedAt: plainTimestamp(data.updatedAt),
    postedAt: plainTimestamp(data.postedAt),
    documents: (data.documents || []).map((document: Record<string, unknown>) => ({ ...document, uploadedAt: plainTimestamp(document.uploadedAt) })),
  };
}

async function assertImportEnabled() {
  const setting = await adminDb.collection('platformSettings').doc(HISTORICAL_IMPORT_SETTING_ID).get();
  if (setting.exists && setting.data()?.enabled === false) throw new Error('Historical importing has been disabled because records have caught up to the present date.');
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
    users: users.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, name: data.name || data.organizationName || 'Unnamed account', email: data.email || '', role: data.role || '', personas: data.personas || [], accountClaimStatus: data.accountClaimStatus || 'ACTIVE', accountType: data.accountType || 'Individual' };
    }),
    setting: { enabled: setting.data()?.enabled !== false, recordsAccurateThrough: plainTimestamp(setting.data()?.recordsAccurateThrough) },
  };
}

export async function createHistoricalImportAction(input: z.infer<typeof createSchema>) {
  const values = createSchema.parse(input);
  const actor = await verifyAdminWrite(values.authToken);
  await assertImportEnabled();
  if (values.existingUserId) {
    const existing = await adminDb.collection('users').doc(values.existingUserId).get();
    if (!existing.exists) throw new Error('The selected customer no longer exists.');
  } else {
    const normalizedPartyName = normalizedIdentity(values.partyName);
    const users = await adminDb.collection('users').select('name', 'organizationName', 'email', 'phoneNumber').get();
    const matchingUser = users.docs.find((document) => {
      const data = document.data();
      return normalizedIdentity(data.name) === normalizedPartyName || normalizedIdentity(data.organizationName) === normalizedPartyName;
    });
    if (matchingUser) {
      throw new Error(`A matching account already exists for ${values.partyName}. Choose that account instead of creating a duplicate.`);
    }
  }
  const ref = adminDb.collection('historicalImports').doc();
  await ref.set({
    partyMode: values.partyMode, existingUserId: values.existingUserId || null, partyKind: values.partyKind, partyName: values.partyName,
    accountType: values.accountType, asOfDate: Timestamp.fromDate(new Date(`${values.asOfDate}T12:00:00Z`)), status: 'DRAFT', documents: [],
    extraction: null, reconciliationIssues: [], createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return { success: true as const, importId: ref.id };
}

export async function getHistoricalImportAction(authToken: string, importId: string) {
  await verifyAdminWrite(authToken);
  const snapshot = await adminDb.collection('historicalImports').doc(importId).get();
  if (!snapshot.exists) return { success: false as const, message: 'Import case not found.' };
  return { success: true as const, importCase: serializeCase(snapshot) };
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
  await verifyAdminWrite(authToken);
  await assertImportEnabled();
  const ref = adminDb.collection('historicalImports').doc(importId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('Import case not found.');
  const data = snapshot.data() || {};
  const documents = (data.documents || []).slice(0, 12) as Array<{ storagePath: string; contentType: string; originalName: string }>;
  if (!documents.length) throw new Error('Upload at least one document before extraction.');
  await ref.update({ processingState: 'ANALYZING', updatedAt: FieldValue.serverTimestamp() });
  try {
    const mediaParts = await Promise.all(documents.map(async (document) => {
      const [buffer] = await adminStorageBucket.file(document.storagePath).download();
      return { media: { url: `data:${document.contentType};base64,${buffer.toString('base64')}`, contentType: document.contentType } };
    }));
    const prompt = `You are extracting historical financial records for NAL General Merchant Ltd. Read every supplied page carefully. Return only facts supported by the documents. Use empty strings or zero where evidence is absent and explain uncertainty in notes. Never infer that projected profit was realised. Deal state must be ONGOING or COMPLETED; use ONGOING when completion is not proven. Dates must be YYYY-MM-DD. Amounts are Nigerian naira numbers. For each deal, documentedOutstanding is the balance explicitly supported by the records, and amountPaid is actual documented payment. For investor positions, availableCapital must represent current unallocated capital as at ${plainTimestamp(data.asOfDate)?.slice(0, 10)}. The primary party is ${data.partyName} (${data.partyKind}, ${data.accountType}). Give each deal a short stable id such as deal-1. Overall confidence is 0 to 1.`;
    const response = await ai.generate({ prompt: [{ text: prompt }, ...mediaParts], output: { schema: extractionSchema } });
    const extraction = extractionSchema.parse(response.output) as HistoricalExtraction;
    if (data.existingUserId) {
      const user = await adminDb.collection('users').doc(data.existingUserId).get();
      if (user.exists) extraction.party.name = user.data()?.name || user.data()?.organizationName || extraction.party.name;
    }
    const selfId = data.existingUserId || 'SELF';
    const primaryName = extraction.party.name.trim().toLowerCase();
    extraction.deals = extraction.deals.map((deal) => ({
      ...deal,
      clientId: deal.clientId || (['CLIENT', 'BOTH'].includes(data.partyKind) && deal.clientName.trim().toLowerCase() === primaryName ? selfId : undefined),
      investors: deal.investors.map((investor) => ({ ...investor, investorId: investor.investorId || (['INVESTOR', 'BOTH'].includes(data.partyKind) && investor.investorName.trim().toLowerCase() === primaryName ? selfId : undefined) })),
    }));
    extraction.fundPositions = extraction.fundPositions.map((position) => ({ ...position, investorId: position.investorId || (['INVESTOR', 'BOTH'].includes(data.partyKind) && position.investorName.trim().toLowerCase() === primaryName ? selfId : undefined) }));
    const issues = reconcileHistoricalExtraction(extraction);
    await ref.update({ extraction, reconciliationIssues: issues, status: hasBlockingHistoricalIssues(issues) ? 'NEEDS_ATTENTION' : 'READY_FOR_REVIEW', processingState: 'COMPLETE', extractedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { success: true as const, extraction, issues };
  } catch (error) {
    await ref.update({ processingState: 'FAILED', processingError: error instanceof Error ? error.message : 'Extraction failed.', updatedAt: FieldValue.serverTimestamp() });
    throw error;
  }
}

export async function saveHistoricalExtractionAction(input: { authToken: string; importId: string; extraction: HistoricalExtraction }) {
  await verifyAdminWrite(input.authToken);
  await assertImportEnabled();
  const extraction = extractionSchema.parse(input.extraction) as HistoricalExtraction;
  const issues = reconcileHistoricalExtraction(extraction);
  const ref = adminDb.collection('historicalImports').doc(input.importId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.status === 'POSTED') throw new Error('This import cannot be edited.');
  await ref.update({ extraction, reconciliationIssues: issues, status: hasBlockingHistoricalIssues(issues) ? 'NEEDS_ATTENTION' : 'READY_FOR_REVIEW', reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { success: true as const, issues };
}

function rolesFor(kind: string) {
  const personas = kind === 'BOTH' ? ['CLIENT', 'INVESTOR'] : [kind];
  const role = kind === 'INVESTOR' ? 'Investor' : 'Client';
  return { personas, role, roles: kind === 'BOTH' ? ['Client', 'Investor'] : [role], primaryPortal: kind === 'INVESTOR' ? 'investor' : 'client' };
}

export async function postHistoricalImportAction(authToken: string, importId: string) {
  const actor = await verifyAdminWrite(authToken);
  await assertImportEnabled();
  const importRef = adminDb.collection('historicalImports').doc(importId);
  const importSnapshot = await importRef.get();
  if (!importSnapshot.exists) throw new Error('Import case not found.');
  const importData = importSnapshot.data() || {};
  if (importData.status === 'POSTED') return { success: true as const, message: 'This import was already posted.', partyId: importData.postedPartyId };
  const extraction = extractionSchema.parse(importData.extraction) as HistoricalExtraction;
  const issues = reconcileHistoricalExtraction(extraction);
  if (hasBlockingHistoricalIssues(issues)) throw new Error('Resolve every red reconciliation issue before posting.');

  const estimatedWrites = 1 + (importData.existingUserId ? 0 : 1)
    + extraction.deals.reduce((count, deal) => count + 1 + deal.investors.length * 3 + (deal.amountPaid > 0 ? 4 : 0), 0)
    + extraction.fundPositions.reduce((count, position) => count + (position.totalDeposited > 0 ? 1 : 0) + (position.totalWithdrawn > 0 ? 1 : 0) + (position.availableCapital > 0 ? 1 : 0), 0)
    + extraction.expenses.filter((expense) => expense.amount > 0).length;
  if (estimatedWrites > MAX_BATCH_WRITES) throw new Error('This case contains too many records for one safe posting. Split it into smaller import cases.');

  let partyId = importData.existingUserId as string | undefined;
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
      const authRecord = await getAuth(getAdminApp()).getUser(historicalUid).catch(() => getAuth(getAdminApp()).createUser({ uid: historicalUid, displayName: extraction.party.name || importData.partyName, disabled: true }));
      partyId = authRecord.uid;
      createdUnclaimedAuth = true;
    }
    const batch = adminDb.batch();
    const now = Timestamp.now();
    const roleModel = rolesFor(importData.partyKind);
    if (createdUnclaimedAuth) {
      batch.set(adminDb.collection('users').doc(partyId), {
        id: partyId, partyId, name: extraction.party.name || importData.partyName, email: '', pendingEmail: extraction.party.email || '', phoneNumber: extraction.party.phoneNumber || '',
        address: extraction.party.address || '', accountType: extraction.party.accountType || importData.accountType, organizationName: extraction.party.accountType === 'Organization' ? extraction.party.name : '',
        organizationRegistrationNumber: extraction.party.organizationRegistrationNumber || '', bankName: extraction.party.bankName || '', bankAccountName: extraction.party.bankAccountName || '',
        bankAccountNumber: '', bankAccountNumberLast4: extraction.party.bankAccountNumberLast4 || '', isMuslim: extraction.party.isMuslim,
        accessRole: 'USER', ...roleModel, accountClaimStatus: 'UNCLAIMED', historicalImportId: importId, createdAt: now,
      });
    }

    for (const [dealIndex, deal] of extraction.deals.entries()) {
      const dealRef = adminDb.collection('deals').doc(historicalDocumentId(importId, 'deal', deal.id || dealIndex));
      const clientId = deal.clientId === 'SELF' ? (['CLIENT', 'BOTH'].includes(importData.partyKind) ? partyId : undefined) : deal.clientId;
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
      };
      batch.set(dealRef, dealData);
      for (const [investorIndex, investor] of deal.investors.entries()) {
        const investorId = investor.investorId === 'SELF' ? (['INVESTOR', 'BOTH'].includes(importData.partyKind) ? partyId : undefined) : investor.investorId;
        if (!investorId) throw new Error(`Link investor ${investor.investorName} to an existing or imported investor before posting.`);
        const investmentRef = adminDb.collection('investments').doc(historicalDocumentId(importId, 'investment', deal.id || dealIndex, investorIndex));
        batch.set(investmentRef, { investorId, dealId: dealRef.id, amount: investor.amountInvested, createdAt: startDate, historicalImport: true, historicalImportId: importId });
        batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'investment-transaction', deal.id || dealIndex, investorIndex)), { userId: investorId, dealId: dealRef.id, investmentId: investmentRef.id, type: 'Investment', amount: -investor.amountInvested, createdAt: startDate, dealName: deal.dealName, historicalImport: true, historicalImportId: importId });
        if (investor.realisedProfit > 0 && investorId !== 'platform') batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'profit', deal.id || dealIndex, investorIndex)), { userId: investorId, dealId: dealRef.id, type: 'ProfitDistribution', amount: investor.realisedProfit, createdAt: importData.asOfDate, profitEarnedAt: importData.asOfDate, dealName: deal.dealName, historicalImport: true, historicalImportId: importId });
      }
      if (deal.amountPaid > 0) {
        const schedule = generateAmortizationSchedule({ id: dealRef.id, ...dealData } as any);
        const allocations = planRepaymentAllocations({ amount: deal.amountPaid, startingInstallment: 1, schedule, approvedRepayments: [] });
        const applied = allocations.reduce((sum, item) => ({ principal: sum.principal + item.principalApplied, profit: sum.profit + item.interestApplied }), { principal: 0, profit: 0 });
        batch.set(adminDb.collection('repayments').doc(historicalDocumentId(importId, 'repayment', deal.id || dealIndex)), { dealId: dealRef.id, clientId, amount: deal.amountPaid, status: 'Approved', lodgedAt: importData.asOfDate, dueDate: importData.asOfDate, installmentNumber: 1, allocations, principalApplied: applied.principal, interestApplied: applied.profit, approvedAt: now, historicalImport: true, historicalImportId: importId });
        batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'repayment-transaction', deal.id || dealIndex)), { userId: clientId, dealId: dealRef.id, type: 'Repayment', amount: -deal.amountPaid, createdAt: importData.asOfDate, dealName: deal.dealName, historicalImport: true, historicalImportId: importId });
        const declaredInvestorProfit = deal.investors.reduce((sum, item) => item.investorId === 'platform' ? sum : sum + item.realisedProfit, 0);
        const platformProfit = Math.max(0, Math.round((applied.profit - declaredInvestorProfit) * 100) / 100);
        if (platformProfit > 0) batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'platform-profit', deal.id || dealIndex)), { userId: 'platform', dealId: dealRef.id, type: 'PlatformEarning', amount: platformProfit, createdAt: importData.asOfDate, dealName: deal.dealName, ownerAllocatable: false, platformEarningKind: 'HistoricalOpening', historicalImport: true, historicalImportId: importId });
      }
    }

    for (const [positionIndex, position] of extraction.fundPositions.entries()) {
      const investorId = position.investorId === 'SELF' ? (['INVESTOR', 'BOTH'].includes(importData.partyKind) ? partyId : undefined) : position.investorId;
      if (!investorId) throw new Error(`Link fund position for ${position.investorName} before posting.`);
      if (position.totalDeposited > 0) batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'fund-deposit', positionIndex)), { userId: investorId, type: 'Deposit', amount: position.totalDeposited, createdAt: importData.asOfDate, details: 'Historical opening deposit total', historicalImport: true, historicalImportId: importId });
      if (position.totalWithdrawn > 0) batch.set(adminDb.collection('transactions').doc(historicalDocumentId(importId, 'fund-withdrawal', positionIndex)), { userId: investorId, type: 'Withdrawal', amount: -position.totalWithdrawn, createdAt: importData.asOfDate, details: 'Historical withdrawal total', historicalImport: true, historicalImportId: importId });
      if (position.availableCapital > 0) batch.set(adminDb.collection('fundBatches').doc(historicalDocumentId(importId, 'fund-batch', positionIndex)), { sourceId: investorId, amount: position.availableCapital, remainingAmount: position.availableCapital, tenureValue: 0, tenureUnit: 'Days', createdAt: importData.asOfDate, historicalImport: true, historicalImportId: importId });
    }
    for (const [expenseIndex, expense] of extraction.expenses.entries()) {
      if (expense.amount <= 0) continue;
      batch.set(adminDb.collection('administrativeTransactions').doc(historicalDocumentId(importId, 'expense', expenseIndex)), { type: 'Expense', amount: -Math.abs(expense.amount), description: expense.description || 'Historical expense', reference: expense.reference || null, createdAt: expense.date ? Timestamp.fromDate(new Date(`${expense.date}T12:00:00Z`)) : importData.asOfDate, historicalImport: true, historicalImportId: importId });
    }
    batch.update(importRef, { status: 'POSTED', postedAt: now, postedBy: actor.uid, postedPartyId: partyId, reconciliationIssues: issues, updatedAt: now });
    await batch.commit();
    return { success: true as const, message: 'Historical records posted successfully.', partyId };
  } catch (error) {
    await importRef.set({ status: 'NEEDS_ATTENTION', postingError: error instanceof Error ? error.message : 'Posting failed.', updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    throw error;
  }
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
