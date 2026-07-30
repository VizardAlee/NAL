
'use server';

import { adminDb } from '@/firebase/admin-app';
import { hasPersona } from '@/lib/access-control';
import { verifyAdminOrOwner, verifyAuthTokenForUser } from '@/lib/server/auth';
import { z } from 'zod';

const marketerStatsSchema = z.object({
  authToken: z.string().min(1),
  marketerId: z.string().min(1),
});

function chunks<T>(items: T[], size = 30): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );
}

export async function getMarketerStats(input: z.infer<typeof marketerStatsSchema>) {
  const validated = marketerStatsSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid marketer statistics request.' };
  }

  const { authToken, marketerId } = validated.data;

  try {
    await verifyAuthTokenForUser(authToken, marketerId).catch(async () => {
      await verifyAdminOrOwner(authToken);
    });
    const marketerSnapshot = await adminDb.collection('users').doc(marketerId).get();
    const marketer = marketerSnapshot.data();
    if (!marketerSnapshot.exists || !hasPersona(marketer, 'MARKETER')) {
      return { success: false, message: 'Marketer profile not found.' };
    }
    const referralCode = typeof marketer?.referralCode === 'string' ? marketer.referralCode : '';

  if (!referralCode) {
    return { success: true, data: { referredClientCount: 0, referredInvestorCount: 0, totalInvestorCapital: 0, totalDealValue: 0, referredClients: [], referredInvestors: [], deals: [] } };
  }

    // 1. Get all users referred by this marketer's code
    const referredUsersQuery = adminDb.collection('users').where('referredByCode', '==', referralCode);
    const referredUsersSnapshot = await referredUsersQuery.get();

    const referredClients = referredUsersSnapshot.docs.filter(doc => hasPersona(doc.data(), 'CLIENT'));
    const referredInvestors = referredUsersSnapshot.docs.filter(doc => hasPersona(doc.data(), 'INVESTOR'));

    // 2. Calculate total capital from referred investors
    let totalInvestorCapital = 0;
    if (referredInvestors.length > 0) {
        const referredInvestorIds = referredInvestors.map(doc => doc.id);
        const snapshots = await Promise.all(
          chunks(referredInvestorIds).map((ids) =>
            adminDb.collection('fundBatches').where('sourceId', 'in', ids).get()
          )
        );
        totalInvestorCapital = snapshots.flatMap((snapshot) => snapshot.docs)
          .reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0);
    }
    
    // 3. Get all deals directly attributed to the marketer via marketerId
    const attributedDealsQuery = adminDb.collection('deals').where('marketerId', '==', marketerId);
    const attributedDealsSnapshot = await attributedDealsQuery.get();
    const attributedDeals = attributedDealsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 4. Get all deals from referred clients
    let referredClientDeals: any[] = [];
    if(referredClients.length > 0) {
        const referredClientIds = referredClients.map(doc => doc.id);
        const snapshots = await Promise.all(
          chunks(referredClientIds).map((ids) =>
            adminDb.collection('deals').where('clientId', 'in', ids).get()
          )
        );
        referredClientDeals = snapshots.flatMap((snapshot) =>
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        );
    }

    // Combine and deduplicate deals
    const allDeals = [...attributedDeals, ...referredClientDeals];
    const uniqueDeals = Array.from(new Map(allDeals.map(deal => [deal.id, deal])).values());
    const totalDealValue = uniqueDeals.reduce((sum, deal) => sum + deal.principal, 0);


    return {
      success: true,
      data: {
        referredClientCount: referredClients.length,
        referredInvestorCount: referredInvestors.length,
        totalInvestorCapital,
        totalDealValue,
        referredClients: referredClients.map(d => d.data().name),
        referredInvestors: referredInvestors.map(d => d.data().name),
        deals: uniqueDeals.map(d => ({dealName: d.dealName, clientName: d.clientName, status: d.status, principal: d.principal})),
      },
    };
  } catch (error) {
    console.error("Error fetching marketer stats:", error);
    return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
  }
}
