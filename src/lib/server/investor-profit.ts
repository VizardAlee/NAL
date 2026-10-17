import type { Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { hasPersona } from '@/lib/access-control';
import { calculateProfitAvailability } from '@/lib/profit-availability';
import { loadFundBatchAnniversaryWindow } from '@/lib/server/fund-batch-anniversary';

/** One transaction snapshot for submission and approval, including both request pools. */
export async function loadInvestorProfit(transaction: Transaction, userId: string, options: { excludeWithdrawal?: string; excludeReinvestment?: string } = {}) {
  const [profile, context, reinvestments] = await Promise.all([
    transaction.get(adminDb.collection('users').doc(userId)),
    loadFundBatchAnniversaryWindow(transaction, userId),
    transaction.get(adminDb.collection('reinvestmentRequests').where('investorId', '==', userId)),
  ]);
  if (!profile.exists || !hasPersona(profile.data() || {}, 'INVESTOR')) throw new Error('The account no longer has investor access.');
  const withdrawalRequests = context.withdrawalRequests.filter(request => request.id !== options.excludeWithdrawal);
  const reinvestmentRequests = reinvestments.docs.filter(doc => doc.id !== options.excludeReinvestment).map(doc => ({ ...doc.data(), id: doc.id } as { id: string; amount?: number; status?: string }));
  const availability = calculateProfitAvailability({ ...context, withdrawalRequests, reinvestmentRequests });
  if (availability.reservationsBlocked) throw new Error('A pending profit request has an invalid amount. An administrator must reject it before processing another request.');
  return { ...context, withdrawalRequests, reinvestmentRequests, ...availability };
}
