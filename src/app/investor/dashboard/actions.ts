
'use server';

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const reinvestSchema = z.object({
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
});

export async function reinvestAction(input: { amount: number; userId: string }): Promise<{ success: boolean; message: string; }> {

  const validatedFields = reinvestSchema.safeParse(input);

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid input. Please try again.',
    };
  }

  const { amount, userId } = validatedFields.data;

  try {
    const { firestore } = initializeFirebase();
    const timestamp = Timestamp.now();
    const batch = firestore.batch();

    // 1. Create a "Withdrawal" transaction to zero out the profit
    const withdrawalTxRef = firestore.collection('transactions').doc();
    batch.set(withdrawalTxRef, {
        userId: userId,
        type: 'Withdrawal',
        amount: -amount,
        createdAt: timestamp,
        details: 'Profit Reinvestment',
    });

    // 2. Create a new "Deposit" transaction for the reinvested amount
    const depositTxRef = firestore.collection('transactions').doc();
    batch.set(depositTxRef, {
        userId: userId,
        type: 'Deposit',
        amount: amount,
        createdAt: timestamp,
        details: 'Profit Reinvestment',
    });

    // 3. Create a new fundBatch for the reinvested amount
    const fundBatchRef = firestore.collection('fundBatches').doc();
    batch.set(fundBatchRef, {
        sourceId: userId,
        amount: amount,
        remainingAmount: amount,
        createdAt: timestamp,
        tenureValue: 10, // Default tenure, can be adjusted
        tenureUnit: 'Years',
    });

    await batch.commit();

    revalidatePath('/investor/dashboard');

    return {
      success: true,
      message: `Successfully reinvested ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount)}.`,
    };
  } catch (error) {
    console.error('REINVESTMENT ERROR:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      success: false,
      message: `Failed to reinvest funds: ${message}`,
    };
  }
}

    