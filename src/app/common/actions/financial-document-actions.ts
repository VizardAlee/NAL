'use server';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import { documentActor, hashDocument, submitFinancialReceipt } from '@/lib/server/financial-documents';
import { assertBankAllocation, bankIdentity, bankRowSchema, suggestReceiptMatches, receiptFieldsSchema, type BankRow, type receiptPurposes } from '@/lib/receipt-reconciliation';
import { prepareReceiptPosting } from '@/lib/server/receipt-posting';
import { processDepositRequestAction, processRepaymentRequestAction } from '@/app/admin/approvals/actions';
import { approveManagementFeeAction } from '@/app/admin/deals/actions';
import { notifyAdmins, notifyUser } from '@/lib/server/notification-service';

async function safely<T>(work: () => Promise<T>) {
  try { return { success: true as const, data: await work() }; }
  catch (error) { return { success: false as const, message: error instanceof z.ZodError ? `Check ${error.issues[0]?.path.join('.') || 'the supplied details'}: ${error.issues[0]?.message}` : error instanceof Error ? error.message : 'The operation could not be completed. Please retry.' }; }
}
function plain(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() || {};
  return JSON.parse(JSON.stringify({ id: doc.id, ...data }, (_key, value) => value && typeof value === 'object' && '_seconds' in value ? new Date(value._seconds * 1000).toISOString() : value));
}

export async function listFinancialDocumentsAction(token: string, bankDate?: string) {
  return safely(async () => {
    const actor = await documentActor(token);
    if (bankDate) z.string().date().parse(bankDate);
    const bankStart = bankDate ? new Date(Date.parse(bankDate)-3*86400000).toISOString().slice(0,10) : '';
    const bankEnd = bankDate ? new Date(Date.parse(bankDate)+3*86400000).toISOString().slice(0,10) : '';
    const bankQuery = bankDate ? adminDb.collection('bankEntries').where('date','>=',bankStart).where('date','<=',bankEnd).orderBy('date','desc').limit(400) : adminDb.collection('bankEntries').orderBy('date','desc').limit(400);
    const receiptQueries = actor.admin ? [adminDb.collection('paymentReceipts').orderBy('uploadedAt', 'desc').limit(100)] : [adminDb.collection('paymentReceipts').where('uploadedBy','==',actor.uid).limit(100), adminDb.collection('paymentReceipts').where('customerId','==',actor.uid).limit(100)];
    const [receiptResults, deals, users, statements, entries] = await Promise.all([
      Promise.all(receiptQueries.map(query => query.get())),
      (actor.admin ? adminDb.collection('deals') : adminDb.collection('deals').where('clientId','==',actor.uid)).get(),
      actor.admin ? adminDb.collection('users').select('name','role','personas').get() : adminDb.collection('users').where('__name__','==',actor.uid).get(),
      actor.admin ? adminDb.collection('bankStatements').orderBy('uploadedAt','desc').limit(20).get() : null,
      actor.admin ? bankQuery.get() : null,
    ]);
    const bankRows = entries?.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankRow)) || [];
    const receipts = [...new Map(receiptResults.flatMap(result => result.docs).map(doc => [doc.id, doc])).values()]
      .sort((a,b) => (b.data()?.uploadedAt?.toMillis?.() || 0) - (a.data()?.uploadedAt?.toMillis?.() || 0))
      .map(doc => {
        const fields = receiptFieldsSchema.safeParse(doc.data()?.fields);
        const data = doc.data()!;
        const matches = actor.admin && fields.success && data.purpose ? suggestReceiptMatches(fields.data, data.purpose, bankRows) : [];
        const covered = statements?.docs.some(statement => statement.data().status === 'REVIEWED' && fields.success && fields.data.paymentDate >= statement.data().periodStart && fields.data.paymentDate <= statement.data().periodEnd && (!fields.data.accountNumber || fields.data.accountNumber === statement.data().accountNumber));
        return { ...plain(doc), matches, reconciliationState: matches.length ? 'MATCH_CANDIDATES' : covered ? 'UNMATCHED' : 'AWAITING_STATEMENT', reversalWarning: bankRows.some(row => row.id === data.bankEntryId && row.reversed) };
      });
    return { admin: actor.admin, uid: actor.uid, receipts, statements: statements?.docs.map(plain) || [], bankRows,
      deals: deals.docs.map(doc => ({ id: doc.id, name: doc.data().dealName, clientId: doc.data().clientId, status: doc.data().status })),
      users: users.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id })), aiEnabled: process.env.FINANCIAL_DOCUMENT_AI_ENABLED === 'true' };
  });
}

export async function submitFinancialReceiptAction(token: string, input: unknown) {
  return safely(async () => {
    const result = await submitFinancialReceipt(token, input);
    const receipt = (await adminDb.collection('paymentReceipts').doc(result.id).get()).data()!;
    // Notification failure must not turn a committed submission into a retry.
    await Promise.all([
      notifyAdmins('Payment evidence submitted', 'A receipt is ready for reconciliation.', '/admin/reconciliation', 'approval'),
      notifyUser(receipt.customerId, 'Receipt submitted', receipt.status === 'EVIDENCE_ONLY' ? 'Saved as historical supporting evidence; no balance was changed.' : 'Your receipt is awaiting bank reconciliation and administrator approval.', '/'+ (receipt.purpose === 'INVESTOR_CONTRIBUTION' ? 'investor' : 'client') +'/receipts', 'approval'),
    ]).catch(() => undefined);
    return result;
  });
}

export async function confirmBankStatementAction(token: string, raw: unknown) {
  return safely(async () => {
    const actor = await verifyAdminWrite(token);
    const input = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), rows: z.array(bankRowSchema).min(1).max(400) }).parse(raw);
    await adminDb.runTransaction(async trx => {
      const ref = adminDb.collection('bankStatements').doc(input.id);
      const statement = await trx.get(ref);
      const data = statement.data();
      if (!data || data.status !== 'DRAFT') throw new Error('Statement has already been reviewed or is unavailable.');
      if (input.rows.some(row => row.date < data.periodStart || row.date > data.periodEnd)) throw new Error('Every row must fall within the statement coverage dates.');
      const rows = input.rows.map(row => ({ ...row, accountNumber: data.accountNumber }));
      const ids = rows.map(row => hashDocument(bankIdentity(row)));
      if (new Set(ids).size !== ids.length) throw new Error('Statement contains indistinguishable duplicate rows. Resolve their bank references before confirming.');
      const snapshots = await Promise.all(ids.map(id => trx.get(adminDb.collection('bankEntries').doc(id))));
      rows.forEach((row,index) => {
        const bankRef = adminDb.collection('bankEntries').doc(ids[index]);
        if (!snapshots[index].exists) trx.create(bankRef, { ...row, allocatedAmount: 0, confirmed: true, statementId: input.id, reviewedBy: actor.uid });
        else if (row.reversed) trx.update(bankRef, { reversed: true });
      });
      trx.update(ref, { status: 'REVIEWED', rows: input.rows, reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), newRows: snapshots.filter(row => !row.exists).length });
    });
    return { message: 'Statement reviewed. Overlapping entries were not imported twice.' };
  });
}

export async function reconcileFinancialReceiptAction(token: string, raw: unknown) {
  return safely(async () => {
    const actor = await verifyAdminWrite(token);
    const input = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), bankEntryId: z.string().regex(/^[a-f0-9]{64}$/), note: z.string().trim().min(5).max(500) }).parse(raw);
    await adminDb.runTransaction(async trx => {
      const ref = adminDb.collection('paymentReceipts').doc(input.id);
      const [receipt, bank] = await Promise.all([trx.get(ref), trx.get(adminDb.collection('bankEntries').doc(input.bankEntryId))]);
      const data = receipt.data();
      if (!data || data.status !== 'SUBMITTED') throw new Error('Receipt has already been reconciled or is unavailable.');
      if (!bank.exists || !bank.data()?.confirmed) throw new Error('Select a reviewed bank entry.');
      if (['FAILED','PENDING'].includes(data.fields.transferStatus)) throw new Error('A pending or failed receipt cannot be reconciled.');
      // An explicitly reviewed bank entry, not the AI, resolves an unknown receipt status.
      const fields = { ...data.fields, transferStatus: 'SUCCESSFUL' as const };
      assertBankAllocation(fields, data.purpose, { id: bank.id, ...bank.data() } as BankRow);
      trx.update(ref, { fields, status: 'RECONCILED', bankEntryId: input.bankEntryId, reconciliationNote: input.note, reconciledBy: actor.uid, reconciledAt: FieldValue.serverTimestamp() });
      if (data.requestId) trx.update(adminDb.collection(data.purpose === 'REPAYMENT' ? 'repayments' : 'depositRequests').doc(data.requestId), { receiptVerification: 'RECONCILED' });
    });
    return { message: 'Reconciled. Financial approval is still required.' };
  });
}

export async function postFinancialReceiptAction(token: string, id: string) {
  return safely(async () => {
    const actor = await verifyAdminWrite(token);
    const ref = adminDb.collection('paymentReceipts').doc(z.string().regex(/^[a-f0-9]{64}$/).parse(id));
    const receipt = (await ref.get()).data();
    if (!receipt) throw new Error('Receipt unavailable.');
    if (receipt.status === 'POSTED' || receipt.status === 'VERIFIED_EVIDENCE') return { message: 'Already processed.' };
    if (receipt.status !== 'RECONCILED') throw new Error('Reconcile this receipt first.');
    if (receipt.purpose === 'REPAYMENT') return processRepaymentRequestAction({ authToken: token, requestId: receipt.requestId, decision: 'Approved' });
    if (receipt.purpose === 'INVESTOR_CONTRIBUTION') return processDepositRequestAction({ authToken: token, requestId: receipt.requestId, decision: 'Approved' });
    if (receipt.purpose === 'MANAGEMENT_FEE') {
      const result = await approveManagementFeeAction(token, receipt.dealId, id);
      if (!result.success) throw new Error(result.message);
      return result;
    }
    // Funding already records allocations. Never debit those balances twice for procurement/disbursement evidence.
    await adminDb.runTransaction(async trx => {
      const receiptDoc = await trx.get(ref);
      const data = receiptDoc.data()!;
      const dealRef = adminDb.collection('deals').doc(data.dealId);
      const deal = await trx.get(dealRef);
      if (!deal.exists || deal.data()?.clientId !== data.customerId) throw new Error('Related deal unavailable.');
      if (data.purpose === 'DISBURSEMENT' && deal.data()?.status !== 'Active') throw new Error('Fund and activate the deal through its normal approval workflow first.');
      const writeReceipt = await prepareReceiptPosting(trx, { receiptId: id, amount: data.fields.amount, purpose: data.purpose as typeof receiptPurposes[number], dealId: data.dealId });
      writeReceipt();
      trx.update(ref, { status: 'VERIFIED_EVIDENCE', approvedBy: actor.uid });
      trx.update(dealRef, { financialEvidenceIds: FieldValue.arrayUnion(id) });
    });
    return { message: 'Verified evidence attached to the deal. No duplicate fund deduction was made.' };
  });
}

export async function rejectFinancialReceiptAction(token: string, id: string, reason: string) {
  return safely(async () => {
    const actor = await verifyAdminWrite(token);
    z.string().trim().min(5).max(500).parse(reason);
    const ref = adminDb.collection('paymentReceipts').doc(z.string().regex(/^[a-f0-9]{64}$/).parse(id));
    await adminDb.runTransaction(async trx => {
      const snapshot = await trx.get(ref);
      const receipt = snapshot.data();
      if (!receipt || !['SUBMITTED','RECONCILED'].includes(receipt.status)) throw new Error('Only unposted receipts can be rejected.');
      const requestRef = receipt.requestId ? adminDb.collection(receipt.purpose === 'REPAYMENT' ? 'repayments' : 'depositRequests').doc(receipt.requestId) : null;
      const request = requestRef ? await trx.get(requestRef) : null;
      if (request && request.data()?.status !== 'Pending') throw new Error('Request has already been processed.');
      if (requestRef) trx.update(requestRef, { status: 'Rejected', processedAt: FieldValue.serverTimestamp() });
      if (receipt.purpose === 'MANAGEMENT_FEE' && receipt.dealId) trx.update(adminDb.collection('deals').doc(receipt.dealId), { managementFeeReceiptId: FieldValue.delete() });
      trx.update(ref, { status: 'REJECTED', rejectionReason: reason, rejectedBy: actor.uid });
    });
    return { message: 'Receipt rejected without changing balances.' };
  });
}
