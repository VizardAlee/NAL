import type { Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { agreementEnvelopeId } from '@/lib/agreements/signing';
import { requiredDealAgreementTypes, requiresAgreementSigning } from '@/lib/workflow-eligibility';

export async function assertInvestmentAgreementExecuted(
  transaction: Transaction,
  sourceId: string,
  options: { allowHistoricalWithoutEnvelope?: boolean } = {}
) {
  const reference = adminDb.collection('agreementEnvelopes').doc(agreementEnvelopeId('MUDARABA', sourceId));
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists && options.allowHistoricalWithoutEnvelope) return;
  if (!snapshot.exists || snapshot.data()?.status !== 'EXECUTED') {
    throw new Error('The investor agreement must be fully signed before this deposit can be approved.');
  }
}

export async function getOutstandingDealAgreements(
  transaction: Transaction,
  dealId: string,
  deal: Record<string, unknown>
): Promise<string[]> {
  if (!requiresAgreementSigning(deal)) return [];
  const types = requiredDealAgreementTypes(deal);
  const snapshots = await Promise.all(types.map((type) =>
    transaction.get(adminDb.collection('agreementEnvelopes').doc(agreementEnvelopeId(type, dealId)))
  ));
  return types.filter((_, index) => !snapshots[index].exists || snapshots[index].data()?.status !== 'EXECUTED');
}

