
'use server';

import { Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins } from '@/app/common/actions/notification-actions';
import { adminDb } from '@/firebase/admin-app';
import { verifyAuthTokenForUser } from '@/lib/server/auth';
import { generateAmortizationSchedule } from '@/lib/amortization';
import { Deal } from '@/lib/types';

// --- Lodge Payment Action ---
const lodgePaymentSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required.'),
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
    authToken: formData.get('authToken'),
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

  const { authToken, dealId, amount, userId, installmentNumber } = validatedFields.data;

  try {
    const firestore = adminDb;
    await verifyAuthTokenForUser(authToken, userId);
    const lodgedAt = Timestamp.now();

    const repaymentData = await firestore.runTransaction(async (trx) => {
      const dealRef = firestore.collection('deals').doc(dealId);
      const dealDoc = await trx.get(dealRef);

      if (!dealDoc.exists) {
        throw new Error('Deal not found.');
      }

      const deal = { ...dealDoc.data(), id: dealDoc.id } as Deal;
      if (deal.clientId !== userId) {
        throw new Error('You are not allowed to lodge payment for this deal.');
      }
      if (deal.status !== 'Active') {
        throw new Error('Payments can only be lodged for active deals.');
      }

      const schedule = generateAmortizationSchedule(deal);
      const installment = schedule.find((item) => item.installment === installmentNumber);
      if (!installment) {
        throw new Error('Installment not found for this deal.');
      }

      const repaymentsQuery = firestore
        .collection('repayments')
        .where('dealId', '==', dealId)
        .where('clientId', '==', userId)
        .where('installmentNumber', '==', installmentNumber);
      const existingRepayments = await trx.get(repaymentsQuery);
      const alreadyLodged = existingRepayments.docs
        .map((doc) => doc.data())
        .filter((repayment) => repayment.status === 'Pending' || repayment.status === 'Approved')
        .reduce((sum, repayment) => sum + Number(repayment.amount || 0), 0);
      const amountRemaining = Math.max(0, installment.payment - alreadyLodged);

      if (amount > amountRemaining + 0.01) {
        throw new Error(`Amount exceeds the remaining installment balance of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amountRemaining)}.`);
      }

      const dueDateTimestamp = Timestamp.fromDate(installment.dueDate);
      const newRepaymentRef = firestore.collection('repayments').doc();
      trx.create(newRepaymentRef, {
        dealId,
        clientId: userId,
        amount,
        status: 'Pending',
        lodgedAt,
        dueDate: dueDateTimestamp,
        installmentNumber,
      });

      return {
        id: newRepaymentRef.id,
        dealId,
        clientId: userId,
        amount,
        status: 'Pending' as const,
        lodgedAt: { _seconds: lodgedAt.seconds, _nanoseconds: lodgedAt.nanoseconds },
        dueDate: { _seconds: dueDateTimestamp.seconds, _nanoseconds: dueDateTimestamp.nanoseconds },
        installmentNumber,
      };
    });

    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
    await notifyAdmins(
        'New Repayment Lodged',
        `A payment of ${formattedAmount} is awaiting approval.`,
        '/admin/approvals/repayments',
        'repayment'
    );

    revalidatePath('/client/dashboard');

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
            '/admin/approvals/terminations',
            'approval'
        );

        revalidatePath('/client/dashboard');

        return { success: true, message: "Your request to terminate the deal has been sent to an administrator for review." };

    } catch (error) {
        console.error("TERMINATION REQUEST ERROR:", error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message: `Failed to submit request: ${message}` };
    }
}
