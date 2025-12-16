
'use server';

import { adminDb } from '@/firebase/admin-app';
import { collection, getDocs, query, where } from 'firebase-admin/firestore';

export async function getMarketerStats(marketerId: string, referralCode: string) {
  if (!referralCode) {
    return { success: true, data: { referredClientCount: 0, referredInvestorCount: 0, totalInvestorCapital: 0, totalDealValue: 0, referredClients: [], referredInvestors: [], deals: [] } };
  }

  try {
    // 1. Get all users referred by this marketer's code
    const referredUsersQuery = query(
      adminDb.collection('users'),
      where('referredByCode', '==', referralCode)
    );
    const referredUsersSnapshot = await getDocs(referredUsersQuery);

    const referredClients = referredUsersSnapshot.docs.filter(doc => doc.data().role === 'Client');
    const referredInvestors = referredUsersSnapshot.docs.filter(doc => doc.data().role === 'Investor');

    // 2. Calculate total capital from referred investors
    let totalInvestorCapital = 0;
    if (referredInvestors.length > 0) {
        const referredInvestorIds = referredInvestors.map(doc => doc.id);
        const fundBatchesQuery = query(
            adminDb.collection('fundBatches'),
            where('sourceId', 'in', referredInvestorIds)
        );
        const fundBatchesSnapshot = await getDocs(fundBatchesQuery);
        totalInvestorCapital = fundBatchesSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
    }
    
    // 3. Get all deals directly attributed to the marketer via marketerId
    const attributedDealsQuery = query(
        adminDb.collection('deals'),
        where('marketerId', '==', marketerId)
    );
    const attributedDealsSnapshot = await getDocs(attributedDealsQuery);
    const attributedDeals = attributedDealsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 4. Get all deals from referred clients
    let referredClientDeals: any[] = [];
    if(referredClients.length > 0) {
        const referredClientIds = referredClients.map(doc => doc.id);
        const referredDealsQuery = query(
            adminDb.collection('deals'),
            where('clientId', 'in', referredClientIds)
        );
        const referredDealsSnapshot = await getDocs(referredDealsQuery);
        referredClientDeals = referredDealsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
