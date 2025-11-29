
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

const payZakatSchema = z.object({
  userId: z.string().min(1),
  zakatAmount: z.coerce.number().positive(),
  investibleBalance: z.coerce.number(),
});

export async function payZakatAction(input: z.infer<typeof payZakatSchema>) {
  const validated = payZakatSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid data provided for Zakat payment.' };
  }

  const { userId, zakatAmount, investibleBalance } = validated.data;
  
  if (investibleBalance < zakatAmount) {
      return { success: false, message: 'Insufficient investible balance to pay Zakat.' };
  }

  try {
    const firestore = adminDb;
    
    // Use a transaction to ensure atomicity
    await firestore.runTransaction(async (transaction) => {
        let amountToDeduct = zakatAmount;

        // 1. Find the user's fund batches, oldest first, that have a remaining balance
        const fundBatchesQuery = firestore.collection('fundBatches')
            .where('sourceId', '==', userId)
            .where('remainingAmount', '>', 0)
            .orderBy('createdAt', 'asc');
        
        const batchesSnapshot = await transaction.get(fundBatchesQuery);

        if (batchesSnapshot.empty) {
            throw new Error("No fund batches with a remaining balance were found for this user.");
        }

        // 2. Deduct from batches FIFO style
        for (const batchDoc of batchesSnapshot.docs) {
            if (amountToDeduct <= 0) break;

            const batchRef = batchDoc.ref;
            const batchData = batchDoc.data();
            const deduction = Math.min(amountToDeduct, batchData.remainingAmount);

            transaction.update(batchRef, { remainingAmount: FieldValue.increment(-deduction) });
            amountToDeduct -= deduction;
        }

        if (amountToDeduct > 0) {
            // This case should be prevented by the initial balance check, but it's a good safeguard.
            throw new Error("Could not deduct the full Zakat amount from the available batches.");
        }

        // 3. Create a Zakat transaction record
        const transactionRef = firestore.collection('transactions').doc();
        transaction.set(transactionRef, {
            userId: userId,
            type: 'Zakat',
            amount: -zakatAmount, // Negative amount as it's a deduction
            createdAt: FieldValue.serverTimestamp(),
            details: 'Annual Zakat Payment'
        });

        // 4. Update the user's last Zakat payment date in their user document
        const userRef = firestore.collection('users').doc(userId);
        transaction.update(userRef, {
            lastZakatPaymentDate: FieldValue.serverTimestamp()
        });
    });

    return { success: true, message: `Zakat of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(zakatAmount)} paid successfully.` };

  } catch (error: any) {
    console.error('Pay Zakat Error:', error);
    return { success: false, message: error.message || 'An unknown error occurred while processing Zakat payment.' };
  }
}

    