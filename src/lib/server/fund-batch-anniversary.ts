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

  const entries = transactionsSnapshot.docs.map((snapshot) => snapshot.data());
  const withdrawalRequests = withdrawalsSnapshot.docs.map((snapshot) => snapshot.data());
  const window = calculateFundBatchAnniversaryWindow({
    fundBatches: fundBatchesSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    })),
    entries,
    withdrawalRequests,
    now,
  });

  return { window, entries, withdrawalRequests };
}
