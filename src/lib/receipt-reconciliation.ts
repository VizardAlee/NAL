import { z } from 'zod';
import Papa from 'papaparse';

export const receiptPurposes = ['REPAYMENT', 'INVESTOR_CONTRIBUTION', 'MANAGEMENT_FEE', 'DISBURSEMENT', 'PROCUREMENT', 'HISTORICAL_EVIDENCE'] as const;
export const receiptFieldsSchema = z.object({
  amount: z.number().finite().min(0.01).max(1e12),
  paymentDate: z.string().date(),
  reference: z.string().trim().max(150).default(''),
  sender: z.string().trim().max(250).default(''),
  beneficiary: z.string().trim().max(250).default(''),
  accountNumber: z.string().regex(/^\d{10}$/).or(z.literal('')).default(''),
  transferStatus: z.enum(['SUCCESSFUL', 'PENDING', 'FAILED', 'UNKNOWN']).default('UNKNOWN'),
});
export type ReceiptFields = z.infer<typeof receiptFieldsSchema>;
export const bankRowSchema = z.object({
  date: z.string().date(), amount: z.number().finite().min(0.01).max(1e12).transform(value => Math.round(value * 100) / 100),
  direction: z.enum(['CREDIT', 'DEBIT']), reference: z.string().trim().max(150).default(''),
  description: z.string().trim().max(500).default(''), reversed: z.boolean().default(false),
});
export type BankRow = z.infer<typeof bankRowSchema> & { id: string; accountNumber: string; allocatedAmount?: number };
export const cents = (amount: number) => Math.round(amount * 100);
export const normalizeReference = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function bankIdentity(row: Omit<BankRow, 'id'>): string {
  // Reference-bearing rows survive overlapping statement uploads and changed narrations.
  return [row.accountNumber, row.direction, cents(row.amount), normalizeReference(row.reference) || `${row.date}|${row.description.trim().toLowerCase()}`].join('|');
}

export function receiptDirection(purpose: typeof receiptPurposes[number]) {
  return purpose === 'DISBURSEMENT' || purpose === 'PROCUREMENT' ? 'DEBIT' : 'CREDIT';
}

export function suggestReceiptMatches(receipt: ReceiptFields, purpose: typeof receiptPurposes[number], rows: BankRow[]) {
  if (receipt.transferStatus === 'FAILED' || receipt.transferStatus === 'PENDING' || purpose === 'HISTORICAL_EVIDENCE') return [];
  const candidates = rows.filter(row => !row.reversed && row.direction === receiptDirection(purpose)
    && cents(row.amount - (row.allocatedAmount || 0)) >= cents(receipt.amount)
    && (!receipt.accountNumber || row.accountNumber === receipt.accountNumber)
    && Math.abs(Date.parse(row.date) - Date.parse(receipt.paymentDate)) <= 3 * 86400000);
  return candidates.map(row => ({ id: row.id, strong: receipt.transferStatus === 'SUCCESSFUL'
    && Boolean(normalizeReference(receipt.reference)) && normalizeReference(receipt.reference) === normalizeReference(row.reference)
    && cents(row.amount - (row.allocatedAmount || 0)) === cents(receipt.amount) }));
}

export function assertBankAllocation(receipt: ReceiptFields, purpose: typeof receiptPurposes[number], row: BankRow) {
  if (receipt.transferStatus !== 'SUCCESSFUL') throw new Error('Confirm a successful transfer before reconciliation.');
  if (row.reversed) throw new Error('A reversed bank entry cannot be allocated.');
  if (row.direction !== receiptDirection(purpose)) throw new Error('Bank credit/debit does not match this workflow.');
  if (receipt.accountNumber && receipt.accountNumber !== row.accountNumber) throw new Error('Bank account does not match the receipt.');
  if (cents(receipt.amount) > cents(row.amount - (row.allocatedAmount || 0))) throw new Error('This allocation exceeds the unallocated bank amount.');
}

export function isOpeningBalanceEvidence(paymentDate: string, cutoff?: string | null) {
  return Boolean(cutoff && paymentDate <= cutoff.slice(0, 10));
}

/** Deliberately strict mapping: silently guessing bank-specific columns is unsafe. */
export function parseBankCsv(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: value => value.trim().toLowerCase() });
  if (parsed.errors.length) throw new Error('CSV could not be read. Check its column structure.');
  if (!['date', 'amount', 'direction'].every(field => parsed.meta.fields?.includes(field))) {
    throw new Error('CSV needs date, amount, direction, reference and description columns. Use YYYY-MM-DD dates and CREDIT/DEBIT directions.');
  }
  if (!parsed.data.length || parsed.data.length > 400) throw new Error('Upload between 1 and 400 bank rows per statement.');
  return parsed.data.map((row, index) => {
    const result = bankRowSchema.safeParse({ ...row, amount: Number(String(row.amount).replace(/,/g, '')), direction: row.direction?.trim().toUpperCase(), reversed: row.reversed?.trim().toLowerCase() === 'true' });
    if (!result.success) throw new Error(`Check CSV row ${index + 2}: use a positive amount, YYYY-MM-DD date and CREDIT/DEBIT direction.`);
    return result.data;
  });
}
