
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins } from '@/app/common/actions/notification-actions';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

const depositSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required.'),
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
  userName: z.string().min(1, "User name is required."),
});

export async function requestDepositAction(input: { authToken: string; amount: number; userId: string; userName: string }): Promise<{ success: boolean; message: string; }> {

  const validatedFields = depositSchema.safeParse(input);

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid input. Please try again.',
    };
  }

  const { authToken, amount, userId, userName } = validatedFields.data;

  try {
    await verifyAuthTokenForUser(authToken, userId);
    const { firestore } = initializeFirebase();
    
    await firestore.collection('depositRequests').add({
      investorId: userId,
      investorName: userName,
      amount: amount,
      status: 'Pending',
      requestedAt: Timestamp.now(),
    });

    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    await notifyAdmins(
        'Deposit Request',
        `${userName} requested to deposit ${formattedAmount}.`,
        '/admin/approvals/deposits',
        'approval'
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
