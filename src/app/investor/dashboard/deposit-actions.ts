
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

async function createNotification(firestore: FirebaseFirestore.Firestore, title: string, message: string, link: string) {
    await firestore.collection('notifications').add({
        title,
        message,
        link,
        read: false,
        createdAt: Timestamp.now(),
    });
}

const depositSchema = z.object({
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
  userName: z.string().min(1, "User name is required."),
});

export async function requestDepositAction(input: { amount: number; userId: string, userName: string }): Promise<{ success: boolean; message: string; }> {

  const validatedFields = depositSchema.safeParse(input);

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid input. Please try again.',
    };
  }

  const { amount, userId, userName } = validatedFields.data;

  try {
    const { firestore } = initializeFirebase();
    
    await firestore.collection('depositRequests').add({
      investorId: userId,
      investorName: userName,
      amount: amount,
      status: 'Pending',
      requestedAt: Timestamp.now(),
    });

    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    await createNotification(
        firestore,
        'Deposit Request',
        `${userName} requested to deposit ${formattedAmount}.`,
        '/admin/approvals/deposits'
    );

    revalidatePath('/investor/dashboard');

    return {
      success: true,
      message: `Successfully requested to deposit ${formattedAmount}. An admin will provide payment details shortly.`,
    };
  } catch (error) {
    console.error('DEPOSIT REQUEST ERROR:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      success: false,
      message: `Failed to request deposit: ${message}`,
    };
  }
}
