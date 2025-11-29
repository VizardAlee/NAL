
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const lodgePaymentSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required."),
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
});

type State = {
  success: boolean;
  message: string;
};

export async function lodgePaymentAction(
  prevState: State,
  formData: FormData
): Promise<State> {

  const validatedFields = lodgePaymentSchema.safeParse({
    dealId: formData.get('dealId'),
    amount: formData.get('amount'),
    userId: formData.get('userId'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid form data. Please try again.',
    };
  }

  const { dealId, amount, userId } = validatedFields.data;

  try {
    const { firestore } = initializeFirebase();
    
    await firestore.collection('repayments').add({
      dealId,
      clientId: userId,
      amount,
      status: 'Pending',
      lodgedAt: Timestamp.now(), // Correct: Using Timestamp from 'firebase-admin/firestore'
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
