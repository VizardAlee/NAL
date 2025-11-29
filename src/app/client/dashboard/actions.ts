
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const lodgePaymentSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required."),
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
  dueDate: z.string().min(1, "Due date is required."), // Add dueDate to schema
});

type RepaymentData = {
    id: string;
    dealId: string;
    clientId: string;
    amount: number;
    status: 'Pending';
    lodgedAt: {
        _seconds: number;
        _nanoseconds: number;
    };
    dueDate: {
        _seconds: number;
        _nanoseconds: number;
    };
}

type State = {
  success: boolean;
  message: string;
  repayment?: RepaymentData | null;
};

export async function lodgePaymentAction(
  prevState: State,
  formData: FormData
): Promise<State> {

  const validatedFields = lodgePaymentSchema.safeParse({
    dealId: formData.get('dealId'),
    amount: formData.get('amount'),
    userId: formData.get('userId'),
    dueDate: formData.get('dueDate'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid form data. Please try again.',
      repayment: null,
    };
  }

  const { dealId, amount, userId, dueDate } = validatedFields.data;

  try {
    const { firestore } = initializeFirebase();
    const lodgedAt = Timestamp.now();
    const dueDateTimestamp = Timestamp.fromDate(new Date(dueDate));
    
    const newRepaymentRef = await firestore.collection('repayments').add({
      dealId,
      clientId: userId,
      amount,
      status: 'Pending',
      lodgedAt: lodgedAt,
      dueDate: dueDateTimestamp, // Save the due date
    });

    revalidatePath('/client/dashboard');

    const repaymentData: RepaymentData = {
        id: newRepaymentRef.id,
        dealId,
        clientId: userId,
        amount,
        status: 'Pending' as const,
        lodgedAt: {
            _seconds: lodgedAt.seconds,
            _nanoseconds: lodgedAt.nanoseconds,
        },
        dueDate: {
             _seconds: dueDateTimestamp.seconds,
            _nanoseconds: dueDateTimestamp.nanoseconds,
        }
    };

    return {
      success: true,
      message: `Payment of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount)} has been submitted.`,
      repayment: repaymentData,
    };
  } catch (error) {
    console.error('LODGE PAYMENT ERROR:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return {
      success: false,
      message: `Failed to lodge payment: ${message}`,
      repayment: null,
    };
  }
}
