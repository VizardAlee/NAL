
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins } from '@/app/common/actions/notification-actions';
import { adminDb } from '@/firebase/admin-app';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

// --- Lodge Payment Action ---
const lodgePaymentSchema = z.object({
  dealId: z.string().min(1, "Deal ID is required."),
  amount: z.coerce.number().positive("Amount must be a positive number."),
  userId: z.string().min(1, "User ID is required."),
  dueDate: z.string().min(1, "Due date is required."),
  installmentNumber: z.coerce.number().int().positive("Installment number is required."),
});

type RepaymentData = {
    id: string;
    dealId: string;
    clientId: string;
    amount: number;
    status: 'Pending';
    lodgedAt: { _seconds: number; _nanoseconds: number; };
    dueDate: { _seconds: number; _nanoseconds: number; };
    installmentNumber: number;
}

type LodgePaymentState = {
  success: boolean;
  message: string;
  repayment?: RepaymentData | null;
};

export async function lodgePaymentAction(
  prevState: LodgePaymentState,
  formData: FormData
): Promise<LodgePaymentState> {

  const validatedFields = lodgePaymentSchema.safeParse({
    dealId: formData.get('dealId'),
    amount: formData.get('amount'),
    userId: formData.get('userId'),
    dueDate: formData.get('dueDate'),
    installmentNumber: formData.get('installmentNumber'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      message: 'Invalid form data. Please try again.',
      repayment: null,
    };
  }

  const { dealId, amount, userId, dueDate, installmentNumber } = validatedFields.data;

  try {
    const firestore = adminDb;
    const lodgedAt = Timestamp.now();
    const dueDateTimestamp = Timestamp.fromDate(new Date(dueDate));
    
    // Server-side validation for partial payment
    // We don't need to block lodging more than is due, but we can check.
    // The admin approval process is the final gatekeeper.
    // For now, we will trust the client-side validation on the form max value.

    const newRepaymentRef = await firestore.collection('repayments').add({
      dealId,
      clientId: userId,
      amount,
      status: 'Pending',
      lodgedAt: lodgedAt,
      dueDate: dueDateTimestamp,
      installmentNumber,
    });

    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    await notifyAdmins(
        'New Repayment Lodged',
        `A payment of ${formattedAmount} is awaiting approval.`,
        '/admin/approvals/repayments'
    );

    revalidatePath('/client/dashboard');

    const repaymentData: RepaymentData = {
        id: newRepaymentRef.id,
        dealId,
        clientId: userId,
        amount,
        status: 'Pending' as const,
        lodgedAt: { _seconds: lodgedAt.seconds, _nanoseconds: lodgedAt.nanoseconds },
        dueDate: { _seconds: dueDateTimestamp.seconds, _nanoseconds: dueDateTimestamp.nanoseconds },
        installmentNumber,
    };

    return {
      success: true,
      message: `Payment of ${formattedAmount} has been submitted for approval.`,
      repayment: repaymentData,
    };
  } catch (error) {
    console.error('LODGE PAYMENT ERROR:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, message: `Failed to lodge payment: ${message}`, repayment: null };
  }
}

// --- Termination Request Action ---
const terminationRequestSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required.'),
  dealId: z.string().min(1),
  dealName: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
});

type TerminationRequestState = {
  success: boolean;
  message: string;
}

export async function requestTerminationAction(
    input: z.infer<typeof terminationRequestSchema>
): Promise<TerminationRequestState> {

    const validatedFields = terminationRequestSchema.safeParse(input);

    if (!validatedFields.success) {
        return { success: false, message: "Invalid data for termination request." };
    }

    const { authToken, dealId, dealName, clientId, clientName } = validatedFields.data;
    
    try {
        await verifyAuthTokenForUser(authToken, clientId);
        const { firestore } = initializeFirebase();
        const requestRef = firestore.collection('terminationRequests').doc(`${dealId}_${clientId}`);
        await firestore.runTransaction(async (trx) => {
            const existingRequest = await trx.get(requestRef);
            if (existingRequest.exists && existingRequest.data()?.status === 'Pending') {
                throw new Error('A termination request for this deal is already pending.');
            }
            trx.set(requestRef, {
                dealId,
                dealName,
                clientId,
                clientName,
                status: 'Pending',
                requestedAt: Timestamp.now(),
            });
        });

        await notifyAdmins(
            'Termination Request',
            `${clientName} requested to terminate the deal "${dealName}".`,
            '/admin/approvals/terminations'
        );

        revalidatePath('/client/dashboard');

        return { success: true, message: "Your request to terminate the deal has been sent to an administrator for review." };

    } catch (error) {
        console.error("TERMINATION REQUEST ERROR:", error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message: `Failed to submit request: ${message}` };
    }
}
