'use server';

import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { verifyAuthToken } from '@/lib/server/auth';
import {
  calculateMaturityDate,
  formatAgreementTerm,
  MUDARABA_AGREEMENT_VERSION,
  nairaAmountInWords,
  type MudarabaAgreementModel,
} from '@/lib/agreements/mudaraba';

const requestSchema = z.object({ authToken: z.string().min(1) });
const agreementRequestSchema = requestSchema.extend({ batchId: z.string().min(1) });

type ServerTimestampLike = { toDate?: () => Date } | Date | string | undefined;

function toDate(value: ServerTimestampLike, fallback = new Date()): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function normalizeTenureUnit(value: unknown): MudarabaAgreementModel['tenureUnit'] {
  return ['Days', 'Weeks', 'Fortnights', 'Months', 'Years'].includes(String(value))
    ? value as MudarabaAgreementModel['tenureUnit']
    : 'Months';
}

async function createAgreementModel(
  userId: string,
  batchSnapshot: FirebaseFirestore.DocumentSnapshot
): Promise<MudarabaAgreementModel> {
  const batch = batchSnapshot.data() || {};
  if (batch.sourceId !== userId) throw new Error('You are not allowed to view this agreement.');

  const [userSnapshot, bankSnapshot, requestSnapshot] = await Promise.all([
    adminDb.collection('users').doc(userId).get(),
    adminDb.collection('platformSettings').doc('bankDetails').get(),
    batch.sourceRequestId
      ? adminDb.collection('depositRequests').doc(String(batch.sourceRequestId)).get()
      : Promise.resolve(null),
  ]);
  if (!userSnapshot.exists) throw new Error('Investor profile not found.');

  const profile = userSnapshot.data() || {};
  const companyBank = bankSnapshot.data() || {};
  const request = requestSnapshot?.data() || {};
  const agreementDate = toDate(batch.agreementDate || batch.paymentDate || request.paymentDate || batch.createdAt);
  const paymentDate = toDate(batch.paymentDate || request.paymentDate || batch.createdAt, agreementDate);
  const tenureValue = Math.max(1, Number(batch.tenureValue || request.tenureValue || 36));
  const tenureUnit = normalizeTenureUnit(batch.tenureUnit || request.tenureUnit);
  const amount = Number(batch.amount || request.amount || 0);
  const paymentReference = String(
    batch.paymentReference || request.paymentReference || batch.sourceRequestId || `NAL-DEP-${batchSnapshot.id.toUpperCase()}`
  );
  const investorAccount = {
    accountName: String(profile.bankAccountName || ''),
    accountNumber: String(profile.bankAccountNumber || ''),
    bankName: String(profile.bankName || ''),
  };
  const receivingAccount = {
    accountName: String(companyBank.accountName || ''),
    accountNumber: String(companyBank.accountNumber || ''),
    bankName: String(companyBank.bankName || ''),
  };

  const missingFields: string[] = [];
  if (!profile.name) missingFields.push('full name');
  if (!profile.address) missingFields.push('residential address');
  if (!profile.photoURL) missingFields.push('profile photograph');
  if (!investorAccount.accountName) missingFields.push('verified account name');
  if (!investorAccount.accountNumber) missingFields.push('verified account number');
  if (!investorAccount.bankName) missingFields.push('verified bank name');
  if (!receivingAccount.accountName || !receivingAccount.accountNumber || !receivingAccount.bankName) {
    missingFields.push('company receiving account');
  }
  if (!Number.isFinite(amount) || amount <= 0) missingFields.push('investment capital');

  return {
    type: 'MUDARABA_INVESTMENT',
    version: MUDARABA_AGREEMENT_VERSION,
    agreementId: `NAL-MUD-${batchSnapshot.id.toUpperCase()}`,
    batchId: batchSnapshot.id,
    agreementDate: agreementDate.toISOString(),
    paymentDate: paymentDate.toISOString(),
    paymentReference,
    amount,
    amountInWords: nairaAmountInWords(amount),
    tenureValue,
    tenureUnit,
    termLabel: formatAgreementTerm(tenureValue, tenureUnit),
    maturityDate: calculateMaturityDate(agreementDate, tenureValue, tenureUnit).toISOString(),
    investor: {
      id: userId,
      name: String(profile.name || ''),
      address: String(profile.address || ''),
      email: String(profile.email || ''),
      phoneNumber: String(profile.phoneNumber || ''),
      ...(profile.photoURL ? { photoURL: String(profile.photoURL) } : {}),
      ...(typeof profile.isMuslim === 'boolean' ? { isMuslim: profile.isMuslim } : {}),
      account: investorAccount,
    },
    company: {
      name: 'NAL GENERAL MERCHANT LTD',
      rcNumber: '9374407',
      address: 'Block 03, Shop No. 02A/03A, Civic Center Ultra Modern Market, Civic Center Road, Kano State',
      email: 'info@nalgm.com',
      website: 'nalgm.com',
      phoneNumbers: '+234(0)8032869067, +234(0)8032065880',
      account: receivingAccount,
    },
    missingFields,
  };
}

export async function listInvestorAgreementsAction(input: { authToken: string }): Promise<
  | { success: true; agreements: MudarabaAgreementModel[] }
  | { success: false; message: string }
> {
  const validated = requestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Authentication is required.' };

  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const batches = await adminDb.collection('fundBatches').where('sourceId', '==', decoded.uid).get();
    const agreementBatches = batches.docs.filter((batch) => Number(batch.data().tenureValue || 0) > 0);
    const agreements = await Promise.all(agreementBatches.map((batch) => createAgreementModel(decoded.uid, batch)));
    agreements.sort((a, b) => new Date(b.agreementDate).getTime() - new Date(a.agreementDate).getTime());
    return { success: true, agreements };
  } catch (error) {
    console.error('Unable to list investor agreements.', error);
    return { success: false, message: 'Unable to load your agreements. Please try again.' };
  }
}

export async function loadInvestorAgreementAction(input: { authToken: string; batchId: string }): Promise<
  | { success: true; agreement: MudarabaAgreementModel }
  | { success: false; message: string }
> {
  const validated = agreementRequestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid agreement request.' };

  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const batch = await adminDb.collection('fundBatches').doc(validated.data.batchId).get();
    if (!batch.exists) return { success: false, message: 'Agreement investment record not found.' };
    if (Number(batch.data()?.tenureValue || 0) <= 0) {
      return { success: false, message: 'This fund movement does not create an investment agreement.' };
    }
    return { success: true, agreement: await createAgreementModel(decoded.uid, batch) };
  } catch (error) {
    console.error('Unable to load investor agreement.', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unable to load this agreement.',
    };
  }
}
