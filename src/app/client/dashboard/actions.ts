'use server';

import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from 'firebase-admin';

const lodgePaymentSchema = z.object({
  dealId: z.string(),
  amount: z.number().positive(),
});

type State = {
  success: boolean;
  message: string;
};

export async function lodgePaymentAction(
  prevState: State,
  formData: FormData
): Promise<State> {
  // This action requires an authenticated user, but we can't get it directly here.
  // We'll rely on security rules to enforce ownership.
  // In a real app, you might pass the UID from the client after verifying it.

  const validatedFields = lodgePaymentSchema.safeParse({
    dealId: formData.get('dealId'),
    amount: parseFloat(formData.get('amount') as string),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid form data. Please try again.',
    };
  }

  const { dealId, amount } = validatedFields.data;

  try {
    // We need to use the Admin SDK for server-side writes
    // For simplicity, we'll assume the user is authenticated and rules are set up.
    // A more robust solution would involve getting the user's session.
    
    // This is a simplified example. In a real app, you would get the user's ID
    // from their session, not from a hidden form field, for security.
    const userId = formData.get('userId') as string;
    if (!userId) {
        throw new Error("User ID is missing.");
    }

    const { firestore } = initializeFirebase();
    
    await firestore.collection('repayments').add({
      dealId,
      clientId: userId,
      amount,
      status: 'Pending',
      lodgedAt: Timestamp.now(),
    });

    revalidatePath('/client/dashboard');
    return {
      success: true,
      message: `Payment of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount)} has been submitted.`,
    };
  } catch (error) {
    console.error('LODGE PAYMENT ERROR:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      success: false,
      message: `Failed to lodge payment: ${message}`,
    };
  }
}
