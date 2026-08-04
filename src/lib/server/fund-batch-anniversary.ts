import type { Transaction } from 'firebase-admin/firestore';
import { calculateFundBatchAnniversaryWindow } from '@/lib/financial-integrity';
import { adminDb } from '@/firebase/admin-app';

export async function loadFundBatchAnniversaryWindow(
  transaction: Transaction,
  userId: string,
  now = new Date()
) {
  const [fundBatchesSnapshot, transactionsSnapshot, withdrawalsSnapshot] = await Promise.all([
    transaction.get(adminDb.collection('fundBatches').where('sourceId', '==', userId)),
    transaction.get(adminDb.collection('transactions').where('userId', '==', userId)),
    transaction.get(adminDb.collection('withdrawalRequests').where('investorId', '==', userId)),
  ]);

  const fundBatches = fundBatchesSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      remainingAmount: Number(data.remainingAmount || 0),
      sourceType: typeof data.sourceType === 'string' ? data.sourceType : undefined,
    };
  });
  const entries = transactionsSnapshot.docs.map((snapshot) => snapshot.data());
  const withdrawalRequests = withdrawalsSnapshot.docs.map((snapshot) => snapshot.data());
  const window = calculateFundBatchAnniversaryWindow({
    fundBatches,
    entries,
    withdrawalRequests,
    now,
  });

  return { window, fundBatches, entries, withdrawalRequests };
}
