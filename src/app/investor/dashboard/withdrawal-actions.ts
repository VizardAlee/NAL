
'use server';

import { notifyAdmins } from '@/app/common/actions/notification-actions';
import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// --- Withdrawal Action ---
const withdrawalSchema = z.object({
    amount: z.coerce.number().positive("Amount must be a positive number."),
    userId: z.string().min(1, "User ID is required."),
    userName: z.string().min(1, "User name is required."),
});

export async function requestWithdrawalAction(prevState: any, formData: FormData) {
    const validatedFields = withdrawalSchema.safeParse({
        amount: formData.get('amount'),
        userId: formData.get('userId'),
        userName: formData.get('userName'),
    });
    
    if (!validatedFields.success) {
        return { success: false, message: 'Invalid form data.' };
    }

    const { userId, userName, amount } = validatedFields.data;

    try {
        const batch = adminDb.batch();
        const now = FieldValue.serverTimestamp();

        // 1. Create the withdrawal request
        const requestRef = adminDb.collection('withdrawalRequests').doc();
        batch.set(requestRef, {
            investorId: userId,
            investorName: userName,
            amount,
            status: 'Pending',
            requestedAt: now,
        });

        // 2. Update the user's last withdrawal date
        const userRef = adminDb.collection('users').doc(userId);
        batch.update(userRef, {
            lastWithdrawalDate: now,
        });
        
        await batch.commit();
        
        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        await notifyAdmins(
            'Withdrawal Request',
            `${userName} requested a withdrawal of ${formattedAmount}.`,
            '/admin/approvals/withdrawals'
        );

        revalidatePath('/admin/approvals/withdrawals');
        revalidatePath('/investor/dashboard');
        
        return { success: true, message: `Your request to withdraw ${formattedAmount} has been submitted.` };
    } catch(error) {
        console.error("WITHDRAWAL REQUEST ACTION ERROR:", error);
        return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
    }
}


// --- Reinvestment Action ---

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
    
    await adminDb.collection('reinvestmentRequests').add({
      investorId: userId,
      investorName: userName,
      amount: amount,
      status: 'Pending',
      requestedAt: FieldValue.serverTimestamp(),
    });

    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    await notifyAdmins(
        'Reinvestment Request',
        `${userName} requested to reinvest ${formattedAmount}.`,
        '/admin/approvals/reinvestments'
    );

    revalidatePath('/investor/dashboard');
    revalidatePath('/admin/approvals/reinvestments');

    return {
      success: true,
      message: `Successfully requested to reinvest ${formattedAmount}. An admin will approve it shortly.`,
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
