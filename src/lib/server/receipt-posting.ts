import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { assertBankAllocation, cents, type BankRow, type ReceiptFields, type receiptPurposes } from '@/lib/receipt-reconciliation';
import { createHash } from 'node:crypto';

/** Read first; invoke the returned writer only AFTER every transaction read. */
export async function prepareReceiptPosting(trx: Transaction, input: {
  receiptId?: string; amount: number; purpose: typeof receiptPurposes[number]; requestId?: string; dealId?: string;
}) {
  if (!input.receiptId) return () => {};
  const ref = adminDb.collection('paymentReceipts').doc(input.receiptId);
  const snapshot = await trx.get(ref);
  const receipt = snapshot.data();
  if (!receipt || receipt.status !== 'RECONCILED' || receipt.purpose !== input.purpose) throw new Error('The receipt must be reconciled by an administrator before approval.');
  if (cents(receipt.fields.amount) !== cents(input.amount)) throw new Error('Request and receipt amounts do not match.');
  if (input.requestId && receipt.requestId !== input.requestId) throw new Error('Receipt is linked to a different request.');
  if (input.dealId && receipt.dealId !== input.dealId) throw new Error('Receipt is linked to a different deal.');
  const reference = String(receipt.fields.reference || '').trim().toUpperCase();
  if (reference) {
    const historicalClaim = await trx.get(adminDb.collection('historicalTransactionReferences').doc(createHash('sha256').update(reference).digest('hex')));
    if (historicalClaim.exists) throw new Error('This payment reference is already included in historical records. Do not credit it again; review the original import.');
  }
  if (input.dealId) {
    const deal = await trx.get(adminDb.collection('deals').doc(input.dealId));
    const cutoff = deal.data()?.importedAsOfDate?.toDate?.().toISOString().slice(0,10);
    if (cutoff && String(receipt.fields.paymentDate) <= cutoff) throw new Error('This receipt predates the imported opening balance. Correct the historical review instead of crediting it again.');
  }
  const bankRef = adminDb.collection('bankEntries').doc(receipt.bankEntryId);
  const bank = await trx.get(bankRef);
  if (!bank.exists || !bank.data()?.confirmed) throw new Error('Bank entry has not been reviewed.');
  const row = { id: bank.id, ...bank.data() } as BankRow;
  assertBankAllocation(receipt.fields as ReceiptFields, input.purpose, row);
  return () => {
    trx.update(bankRef, { allocatedAmount: (cents(row.allocatedAmount || 0) + cents(input.amount)) / 100 });
    trx.update(ref, { status: 'POSTED', postedAt: FieldValue.serverTimestamp() });
  };
}
