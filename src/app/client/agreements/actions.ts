'use server';

import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { verifyAuthToken } from '@/lib/server/auth';
import { WAKALAH_AGREEMENT_VERSION, type WakalahAgreementModel } from '@/lib/agreements/wakalah';
import { KAFAALAH_BOND_VERSION, type KafaalahBondModel } from '@/lib/agreements/kafaalah';
import { MURABAHA_AGREEMENT_VERSION, type MurabahaAgreementModel } from '@/lib/agreements/murabaha';
import { generateAmortizationSchedule } from '@/lib/amortization';
import type { Deal } from '@/lib/types';

const requestSchema = z.object({ authToken: z.string().min(1) });
const agreementSchema = requestSchema.extend({ dealId: z.string().min(1) });
type DateLike = { toDate?: () => Date } | Date | string | undefined;

function toDate(value: DateLike): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

async function createModel(userId: string, snapshot: FirebaseFirestore.DocumentSnapshot): Promise<WakalahAgreementModel> {
  const deal = snapshot.data() || {};
  if (deal.clientId !== userId) throw new Error('You are not allowed to view this agreement.');
  if (deal.wakalahGranted !== true || deal.financingMode !== 'Murabaha') {
    throw new Error('Procurement authority was not granted for this deal.');
  }
  const profileSnapshot = await adminDb.collection('users').doc(userId).get();
  if (!profileSnapshot.exists) throw new Error('Client profile not found.');
  const profile = profileSnapshot.data() || {};
  const assetDescription = String(deal.wakalahAssetDescription || '');
  const supplierName = String(deal.wakalahSupplierName || '');
  const missingFields: string[] = [];
  if (!profile.name) missingFields.push('full name');
  if (!profile.address) missingFields.push('residential address');
  if (!profile.photoURL) missingFields.push('profile photograph');
  if (!assetDescription) missingFields.push('approved asset description');
  if (!supplierName) missingFields.push('approved supplier');
  if (!Number.isFinite(Number(deal.principal)) || Number(deal.principal) <= 0) missingFields.push('procurement amount');

  return {
    type: 'WAKALAH_PROCUREMENT',
    version: WAKALAH_AGREEMENT_VERSION,
    agreementId: `NAL-WAK-${snapshot.id.toUpperCase()}`,
    dealId: snapshot.id,
    agreementDate: toDate(deal.wakalahAgreementDate || deal.startDate || deal.createdAt).toISOString(),
    client: {
      id: userId,
      name: String(profile.name || deal.clientName || ''),
      address: String(profile.address || ''),
      email: String(profile.email || ''),
      phoneNumber: String(profile.phoneNumber || ''),
      ...(profile.photoURL ? { photoURL: String(profile.photoURL) } : {}),
    },
    company: {
      name: 'NAL GENERAL MERCHANT LTD',
      rcNumber: '9374407',
      address: 'Block 03, Shop No. 02A/03A, Civic Center Ultra Modern Market, Civic Center Road, Kano State',
      email: 'info@nalgm.com',
      website: 'nalgm.com',
      phoneNumbers: '+234(0)8032869067, +234(0)8032056880',
    },
    deal: {
      name: String(deal.dealName || ''),
      assetDescription,
      supplierName,
      principal: Number(deal.principal || 0),
      financingMode: 'Murabaha',
    },
    missingFields,
  };
}

async function createKafaalahModel(userId: string, snapshot: FirebaseFirestore.DocumentSnapshot): Promise<KafaalahBondModel> {
  const deal = snapshot.data() || {};
  if (deal.clientId !== userId) throw new Error('You are not allowed to view this bond.');
  const profileSnapshot = await adminDb.collection('users').doc(userId).get();
  if (!profileSnapshot.exists) throw new Error('Client profile not found.');
  const profile = profileSnapshot.data() || {};
  const missingFields: string[] = [];
  if (!profile.name) missingFields.push('client full name');
  if (!profile.address) missingFields.push('client residential address');
  if (!deal.guarantorName) missingFields.push('guarantor full name');
  if (!deal.guarantorAddress) missingFields.push('guarantor residential address');
  if (!deal.guarantorPhoneNumber) missingFields.push('guarantor phone number');
  if (!deal.guarantorOccupation) missingFields.push('guarantor occupation');
  if (!deal.guarantorPhotoURL) missingFields.push('guarantor photograph');
  if (!Number.isFinite(Number(deal.principal)) || Number(deal.principal) <= 0) missingFields.push('contract amount');
  const financingMode = ['Murabaha', 'Ijara', 'Mudaraba'].includes(String(deal.financingMode))
    ? deal.financingMode as KafaalahBondModel['deal']['financingMode']
    : 'Murabaha';
  const agreementDate = toDate(deal.startDate || deal.createdAt);
  return {
    type: 'KAFAALAH_GUARANTEE',
    version: KAFAALAH_BOND_VERSION,
    bondId: `NAL-KAF-${snapshot.id.toUpperCase()}`,
    dealId: snapshot.id,
    bondDate: agreementDate.toISOString(),
    principalAgreementDate: agreementDate.toISOString(),
    company: {
      name: 'NAL GENERAL MERCHANT LTD', rcNumber: '9374407',
      address: 'Block 03, Shop No. 02A/03A, Civic Center Ultra Modern Market, Civic Center Road, Kano State',
      email: 'info@nalgm.com', website: 'nalgm.com', phoneNumbers: '+234(0)8032869067, +234(0)8032056880',
    },
    client: { id: userId, name: String(profile.name || deal.clientName || ''), address: String(profile.address || '') },
    guarantor: {
      name: String(deal.guarantorName || ''), address: String(deal.guarantorAddress || ''),
      phoneNumber: String(deal.guarantorPhoneNumber || ''), occupation: String(deal.guarantorOccupation || ''),
      ...(deal.guarantorPhotoURL ? { photoURL: String(deal.guarantorPhotoURL) } : {}),
    },
    deal: { name: String(deal.dealName || ''), principal: Number(deal.principal || 0), profitRate: Number(deal.profitRate || 0), financingMode },
    missingFields,
  };
}

async function createMurabahaModel(userId: string, snapshot: FirebaseFirestore.DocumentSnapshot): Promise<MurabahaAgreementModel> {
  const deal = snapshot.data() || {};
  if (deal.clientId !== userId) throw new Error('You are not allowed to view this agreement.');
  if (deal.financingMode !== 'Murabaha') throw new Error('This deal is not a Murabaha transaction.');
  const profileSnapshot = await adminDb.collection('users').doc(userId).get();
  if (!profileSnapshot.exists) throw new Error('Client profile not found.');
  const profile = profileSnapshot.data() || {};
  const schedule = generateAmortizationSchedule({ id: snapshot.id, ...deal } as Deal);
  const totalProfit = schedule.reduce((sum, installment) => sum + installment.interest, 0);
  const contractPrice = schedule.reduce((sum, installment) => sum + installment.payment, 0);
  let scheduledAmount = 0;
  const scheduleRows = schedule.map((installment) => {
    const openingBalance = Math.max(0, contractPrice - scheduledAmount);
    scheduledAmount += installment.payment;
    return {
      installment: installment.installment,
      dueDate: installment.dueDate.toISOString(),
      openingBalance,
      profit: installment.interest,
      principal: installment.principal,
      payment: installment.payment,
      closingBalance: Math.max(0, contractPrice - scheduledAmount),
    };
  });
  const payments = schedule.map((installment) => installment.payment);
  const assetDescription = String(deal.wakalahAssetDescription || deal.dealName || '');
  const missingFields: string[] = [];
  if (!profile.name) missingFields.push('client full name');
  if (!profile.address) missingFields.push('client residential address');
  if (!profile.photoURL) missingFields.push('client passport photograph');
  if (!assetDescription) missingFields.push('approved asset description');
  if (!deal.guarantorName) missingFields.push('guarantor full name');
  if (!deal.guarantorAddress) missingFields.push('guarantor residential address');
  if (!deal.guarantorPhoneNumber) missingFields.push('guarantor phone number');
  if (!Number.isFinite(Number(deal.principal)) || Number(deal.principal) <= 0) missingFields.push('cost price');
  if (!schedule.length) missingFields.push('dated repayment schedule');

  return {
    type: 'MURABAHA_SALE',
    version: MURABAHA_AGREEMENT_VERSION,
    agreementId: `NAL-MUR-${snapshot.id.toUpperCase()}`,
    dealId: snapshot.id,
    agreementDate: toDate(deal.startDate || deal.createdAt).toISOString(),
    client: {
      id: userId,
      name: String(profile.name || deal.clientName || ''),
      address: String(profile.address || ''),
      email: String(profile.email || ''),
      phoneNumber: String(profile.phoneNumber || ''),
      ...(profile.photoURL ? { photoURL: String(profile.photoURL) } : {}),
    },
    guarantor: {
      name: String(deal.guarantorName || ''),
      address: String(deal.guarantorAddress || ''),
      phoneNumber: String(deal.guarantorPhoneNumber || ''),
      occupation: String(deal.guarantorOccupation || ''),
    },
    company: {
      name: 'NAL GENERAL MERCHANT LTD',
      rcNumber: '9374407',
      address: 'Block 03, Shop No. 02A/03A, Civic Center Ultra Modern Market, Civic Center Road, Kano State',
      email: 'info@nalgm.com',
      website: 'nalgm.com',
      phoneNumbers: '+234(0)8032869067, +234(0)8032056880',
      account: { accountName: 'NAL General Merchant Ltd', accountNumber: '0513848871', bankName: 'Sterling Bank' },
    },
    deal: {
      name: String(deal.dealName || ''),
      assetDescription,
      costPrice: Number(deal.principal || 0),
      profitRate: Number(deal.profitRate || 0),
      profit: totalProfit,
      contractPrice,
      durationValue: Number(deal.durationValue || 0),
      durationUnit: String(deal.durationUnit || ''),
      repaymentFrequency: String(deal.repaymentFrequency || ''),
      installmentCount: schedule.length,
      installmentMinimum: payments.length ? Math.min(...payments) : 0,
      installmentMaximum: payments.length ? Math.max(...payments) : 0,
      managementFeeRate: Number(deal.managementFeeRate || 0),
      managementFeeAmount: Number(deal.managementFeeAmount || 0),
      wakalahGranted: deal.wakalahGranted === true,
      schedule: scheduleRows,
    },
    missingFields,
  };
}

export async function listClientAgreementsAction(input: { authToken: string }): Promise<
  | { success: true; agreements: WakalahAgreementModel[] }
  | { success: false; message: string }
> {
  const validated = requestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Authentication is required.' };
  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const deals = await adminDb.collection('deals').where('clientId', '==', decoded.uid).get();
    const eligible = deals.docs.filter((deal) => deal.data().wakalahGranted === true && deal.data().financingMode === 'Murabaha');
    const agreements = await Promise.all(eligible.map((deal) => createModel(decoded.uid, deal)));
    agreements.sort((a, b) => new Date(b.agreementDate).getTime() - new Date(a.agreementDate).getTime());
    return { success: true, agreements };
  } catch (error) {
    console.error('Unable to list client agreements.', error);
    return { success: false, message: 'Unable to load your agreements. Please try again.' };
  }
}

export async function loadClientAgreementAction(input: { authToken: string; dealId: string }): Promise<
  | { success: true; agreement: WakalahAgreementModel }
  | { success: false; message: string }
> {
  const validated = agreementSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid agreement request.' };
  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const deal = await adminDb.collection('deals').doc(validated.data.dealId).get();
    if (!deal.exists) return { success: false, message: 'Deal not found.' };
    return { success: true, agreement: await createModel(decoded.uid, deal) };
  } catch (error) {
    console.error('Unable to load client agreement.', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to load this agreement.' };
  }
}

export async function listClientKafaalahBondsAction(input: { authToken: string }): Promise<
  | { success: true; bonds: KafaalahBondModel[] }
  | { success: false; message: string }
> {
  const validated = requestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Authentication is required.' };
  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const deals = await adminDb.collection('deals').where('clientId', '==', decoded.uid).get();
    const bonds = await Promise.all(deals.docs.map((deal) => createKafaalahModel(decoded.uid, deal)));
    bonds.sort((a, b) => new Date(b.bondDate).getTime() - new Date(a.bondDate).getTime());
    return { success: true, bonds };
  } catch (error) {
    console.error('Unable to list Kafaalah bonds.', error);
    return { success: false, message: 'Unable to load your guarantee bonds. Please try again.' };
  }
}

export async function loadClientKafaalahBondAction(input: { authToken: string; dealId: string }): Promise<
  | { success: true; bond: KafaalahBondModel }
  | { success: false; message: string }
> {
  const validated = agreementSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid bond request.' };
  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const deal = await adminDb.collection('deals').doc(validated.data.dealId).get();
    if (!deal.exists) return { success: false, message: 'Deal not found.' };
    return { success: true, bond: await createKafaalahModel(decoded.uid, deal) };
  } catch (error) {
    console.error('Unable to load Kafaalah bond.', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to load this bond.' };
  }
}

export async function listClientMurabahaAgreementsAction(input: { authToken: string }): Promise<
  | { success: true; agreements: MurabahaAgreementModel[] }
  | { success: false; message: string }
> {
  const validated = requestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Authentication is required.' };
  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const deals = await adminDb.collection('deals').where('clientId', '==', decoded.uid).get();
    const eligible = deals.docs.filter((deal) => deal.data().financingMode === 'Murabaha');
    const agreements = await Promise.all(eligible.map((deal) => createMurabahaModel(decoded.uid, deal)));
    agreements.sort((left, right) => new Date(right.agreementDate).getTime() - new Date(left.agreementDate).getTime());
    return { success: true, agreements };
  } catch (error) {
    console.error('Unable to list Murabaha agreements.', error);
    return { success: false, message: 'Unable to load your Murabaha agreements. Please try again.' };
  }
}

export async function loadClientMurabahaAgreementAction(input: { authToken: string; dealId: string }): Promise<
  | { success: true; agreement: MurabahaAgreementModel }
  | { success: false; message: string }
> {
  const validated = agreementSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid agreement request.' };
  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const deal = await adminDb.collection('deals').doc(validated.data.dealId).get();
    if (!deal.exists) return { success: false, message: 'Deal not found.' };
    return { success: true, agreement: await createMurabahaModel(decoded.uid, deal) };
  } catch (error) {
    console.error('Unable to load Murabaha agreement.', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unable to load this agreement.' };
  }
}
