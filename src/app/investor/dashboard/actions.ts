
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const reinvestSchema = z.object({
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
  userName: z.string().min(1, "User name is required."),
});

export async function reinvestAction(input: { amount: number; userId: string, userName: string }): Promise<{ success: boolean; message: string; }> {

  const validatedFields = reinvestSchema.safeParse(input);

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid input. Please try again.',
    };
  }

  const { amount, userId, userName } = validatedFields.data;

  try {
    const { firestore } = initializeFirebase();
    
    // Create a reinvestment request for the admin to approve
    await firestore.collection('reinvestmentRequests').add({
      investorId: userId,
      investorName: userName,
      amount: amount,
      status: 'Pending',
      requestedAt: Timestamp.now(),
    });

    revalidatePath('/investor/dashboard');

    return {
      success: true,
      message: `Successfully requested to reinvest ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount)}. An admin will approve it shortly.`,
    };
  } catch (error) {
    console.error('REINVESTMENT REQUEST ERROR:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      success: false,
      message: `Failed to request reinvestment: ${message}`,
    };
  }
}
