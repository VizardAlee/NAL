import { prepareMarketingReplenishment as prepareCore, assertMarketingPoolCurrent as assertCurrent } from '../../../functions/src/marketing-fund-core';
import { adminDb } from '@/firebase/admin-app';
import { Timestamp, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { commissionKobo, kobo } from '@/lib/marketing-fund';
import { hasPersona } from '@/lib/access-control';

export const poolRef = () => adminDb.doc('marketingPools/main');
export const obligationRef = (dealId: string) => adminDb.collection('marketingCommissions').doc(dealId);

/** Called in the transaction that applies the final Murabaha signature. No backfill. */
export async function prepareCommissionAccrual(trx: Transaction, dealId: string, envelope: DocumentData) {
  const ref = obligationRef(dealId);
  const [dealSnap, existing] = await Promise.all([trx.get(adminDb.doc(`deals/${dealId}`)), trx.get(ref)]);
  const deal = dealSnap.data();
  if (existing.exists || deal?.marketingCommissionPolicy !== 1 || !deal.marketerId || envelope.agreementType !== 'MURABAHA' || deal.historicalImportId) return () => {};
  const profile = await trx.get(adminDb.doc(`users/${deal.marketerId}`));
  if (!hasPersona(profile.data(), 'MARKETER')) throw new Error('The assigned marketer no longer has marketer access. Reassign before signing.');
  const model = envelope.documentModel;
  if (model?.type !== 'MURABAHA_SALE' || model.client.id !== deal.clientId) throw new Error('Invalid signed commission basis.');
  const earnedKobo = commissionKobo(model.deal.profit), basisKobo = kobo(model.deal.contractPrice);
  if (basisKobo <= 0) throw new Error('Invalid signed repayment basis.');
  return () => trx.create(ref, {
    dealId, clientId: deal.clientId, marketerId: deal.marketerId, marketerName: String(profile.data()?.name || 'Marketer'),
    earnedKobo, fundedKobo: 0, replenishedKobo: 0, netClearedKobo: 0, repaymentBasisKobo: basisKobo,
    agreedProfitKobo: kobo(model.deal.profit), commissionPercent: 5, profitRate: model.deal.profitRate,
    documentHash: envelope.documentHash, agreementReference: envelope.agreementReference,
    earnedAt: Timestamp.now(), policyVersion: 1, revision: 0,
  });
}

/** Shared with the retryable receipt-change Function. */
export function prepareMarketingReplenishment(trx: Transaction, input: Parameters<typeof prepareCore>[2]) {
  return prepareCore(adminDb, trx, input);
}
export function assertMarketingPoolCurrent(trx: Transaction) { return assertCurrent(adminDb, trx); }
