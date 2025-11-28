
'use server';

import { initializeFirebase } from '@/firebase/server';
import { FieldValue, runTransaction } from 'firebase-admin/firestore';

// This is a simplified server-side action using firebase-admin.
// In a real app, you would have more robust error handling and validation.
export async function fundDealAction(dealId: string): Promise<{ success: boolean, message: string }> {
    if (!dealId) {
        return { success: false, message: 'Deal ID is missing.' };
    }
    
    const { firestore } = initializeFirebase();

    try {
        await runTransaction(firestore, async (transaction) => {
            const dealRef = firestore.collection('deals').doc(dealId);
            const dealDoc = await transaction.get(dealRef);

            if (!dealDoc.exists) {
                throw new Error('Deal not found.');
            }

            const dealData = dealDoc.data();
            if (!dealData) {
                throw new Error('Deal data is invalid.');
            }

            if (dealData.status !== 'Pending') {
                throw new Error(`Deal is already ${dealData.status}.`);
            }

            // 1. Calculate how much has already been funded
            const investmentsSnapshot = await transaction.get(
                firestore.collection('investments').where('dealId', '==', dealId)
            );
            const totalFunded = investmentsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            
            let amountToFund = dealData.principal - totalFunded;

            if (amountToFund <= 0) {
                // If it's already funded but still pending, just activate it.
                transaction.update(dealRef, { status: 'Active' });
                return;
            }

            // 2. Get all available fund batches, ordered by creation date (FIFO)
            const fundBatchesQuery = firestore.collection('fundBatches')
                .where('remainingAmount', '>', 0)
                .orderBy('remainingAmount')
                .orderBy('createdAt', 'asc');
            
            const fundBatchesSnapshot = await transaction.get(fundBatchesQuery);
            
            const totalAvailableFunds = fundBatchesSnapshot.docs.reduce((sum, doc) => sum + doc.data().remainingAmount, 0);
            
            if (totalAvailableFunds < amountToFund) {
                throw new Error(`Insufficient funds available. Need ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amountToFund)}, but only ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(totalAvailableFunds)} is available.`);
            }

            // 3. Iterate through batches and create investments
            for (const batchDoc of fundBatchesSnapshot.docs) {
                if (amountToFund <= 0) break;

                const batchData = batchDoc.data();
                const amountToDeduct = Math.min(amountToFund, batchData.remainingAmount);

                // a. Create investment record
                const investmentRef = firestore.collection('investments').doc();
                transaction.set(investmentRef, {
                    investorId: batchData.sourceId,
                    dealId: dealId,
                    amount: amountToDeduct,
                    createdAt: FieldValue.serverTimestamp(),
                });

                // b. Create transaction log
                const transactionRef = firestore.collection('transactions').doc();
                transaction.set(transactionRef, {
                    userId: batchData.sourceId,
                    dealId: dealId,
                    type: 'Investment',
                    amount: -amountToDeduct,
                    createdAt: FieldValue.serverTimestamp(),
                    dealName: dealData.dealName,
                });

                // c. Update the fund batch
                transaction.update(batchDoc.ref, {
                    remainingAmount: FieldValue.increment(-amountToDeduct)
                });
                
                amountToFund -= amountToDeduct;
            }

            // 4. If fully funded, update the deal status to 'Active'
            if (amountToFund <= 0) {
                transaction.update(dealRef, { status: 'Active' });
            }
        });

        return { success: true, message: 'Deal has been successfully funded and is now Active.' };

    } catch (error: any) {
        console.error('DEAL FUNDING FAILED:', error);
        return { success: false, message: error.message || 'An unknown error occurred during funding.' };
    }
}
