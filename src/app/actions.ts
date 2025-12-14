
'use server';

import { adminDb } from '@/firebase/admin-app';

export async function getPublicStats() {
  try {
    const usersSnapshot = await adminDb.collection('users').get();
    const fundBatchesSnapshot = await adminDb.collection('fundBatches').get();
    const dealsSnapshot = await adminDb
      .collection('deals')
      .where('status', 'in', ['Active', 'Completed', 'Terminated'])
      .get();

    const totalUsers = usersSnapshot.size;
    const totalInvestments = fundBatchesSnapshot.docs.reduce(
      (sum, doc) => sum + doc.data().amount,
      0
    );
    const totalDealsFunded = dealsSnapshot.docs.reduce(
      (sum, doc) => sum + doc.data().principal,
      0
    );

    return { totalUsers, totalInvestments, totalDealsFunded };
  } catch (error) {
    console.error('Error fetching public stats:', error);
    // Return zeroed stats on error to avoid breaking the client
    return {
      totalUsers: 0,
      totalInvestments: 0,
      totalDealsFunded: 0,
    };
  }
}
