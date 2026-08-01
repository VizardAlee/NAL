
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins } from '@/lib/server/notification-service';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

const depositSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required.'),
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
  userName: z.string().min(1, "User name is required."),
  tenureValue: z.coerce.number().int().positive().max(120),
  tenureUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  paymentDate: z.string().date(),
  paymentReference: z.string().trim().max(100).optional(),
}).refine(
  ({ tenureValue, tenureUnit }) => {
    const maximums = { Days: 3650, Weeks: 520, Fortnights: 260, Months: 120, Years: 10 } as const;
    return tenureValue <= maximums[tenureUnit];
  },
  { message: 'Investment term cannot exceed ten years.', path: ['tenureValue'] }
);

export async function requestDepositAction(input: {
  authToken: string;
  amount: number;
  userId: string;
  userName: string;
  tenureValue: number;
  tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
  paymentDate: string;
  paymentReference?: string;
}): Promise<{ success: boolean; message: string; }> {

  const validatedFields = depositSchema.safeParse(input);

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid input. Please try again.',
    };
  }

  const { authToken, amount, userId, userName, tenureValue, tenureUnit, paymentDate, paymentReference } = validatedFields.data;

  try {
    await verifyAuthTokenForUser(authToken, userId);
    const { firestore } = initializeFirebase();
    
    const requestRef = firestore.collection('depositRequests').doc();
    const transactionReference = paymentReference || `NAL-DEP-${requestRef.id.toUpperCase()}`;
    await requestRef.set({
      investorId: userId,
      investorName: userName,
      amount: amount,
      status: 'Pending',
      requestedAt: Timestamp.now(),
      paymentDate: Timestamp.fromDate(new Date(`${paymentDate}T12:00:00+01:00`)),
      paymentReference: transactionReference,
      tenureValue,
      tenureUnit,
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
