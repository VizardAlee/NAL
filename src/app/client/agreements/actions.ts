'use server';

import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { verifyAuthToken } from '@/lib/server/auth';
import { WAKALAH_AGREEMENT_VERSION, type WakalahAgreementModel } from '@/lib/agreements/wakalah';

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
