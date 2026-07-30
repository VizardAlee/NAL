
'use server';

import { Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins } from '@/lib/server/notification-service';
import { adminDb } from '@/firebase/admin-app';
import { verifyAuthTokenForUser } from '@/lib/server/auth';
import { calculateRemainingRepaymentBalance, generateAmortizationSchedule } from '@/lib/amortization';
import { Deal } from '@/lib/types';
import { roundCurrency } from '@/lib/financial-integrity';

// --- Lodge Payment Action ---
const lodgePaymentSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required.'),
  dealId: z.string().min(1, "Deal ID is required."),
  amount: z.coerce.number().finite().positive("Amount must be a positive number."),
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
  const normalizedAmount = roundCurrency(amount);
  if (normalizedAmount < 0.01) {
    return {
      success: false,
      message: 'Payment must be at least ₦0.01.',
      repayment: null,
    };
  }

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
      const repaymentRecords = existingRepayments.docs.map((doc) => doc.data());
      if (repaymentRecords.some((repayment) => repayment.status === 'Pending')) {
        throw new Error('A payment request for this installment is already awaiting administrator approval.');
      }
      const alreadyApproved = roundCurrency(repaymentRecords
        .filter((repayment) => repayment.status === 'Approved')
        .reduce((sum, repayment) => sum + Number(repayment.amount || 0), 0));
      const amountRemaining = Math.max(0, roundCurrency(installment.payment - alreadyApproved));

      if (normalizedAmount > amountRemaining) {
        throw new Error(`Amount exceeds the remaining installment balance of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amountRemaining)}.`);
      }

      const dueDateTimestamp = Timestamp.fromDate(installment.dueDate);
      const newRepaymentRef = firestore.collection('repayments').doc();
      trx.create(newRepaymentRef, {
        dealId,
        clientId: userId,
        amount: normalizedAmount,
        status: 'Pending',
        lodgedAt,
        dueDate: dueDateTimestamp,
        installmentNumber,
      });

      return {
        id: newRepaymentRef.id,
        dealId,
        clientId: userId,
        amount: normalizedAmount,
        status: 'Pending' as const,
        lodgedAt: { _seconds: lodgedAt.seconds, _nanoseconds: lodgedAt.nanoseconds },
        dueDate: { _seconds: dueDateTimestamp.seconds, _nanoseconds: dueDateTimestamp.nanoseconds },
        installmentNumber,
      };
    });

    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(normalizedAmount);
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
        const requestRef = adminDb.collection('terminationRequests').doc(`${dealId}_${clientId}`);
        const settlement = await adminDb.runTransaction(async (trx) => {
            const dealRef = adminDb.collection('deals').doc(dealId);
            const [existingRequest, dealSnapshot, repaymentsSnapshot] = await Promise.all([
                trx.get(requestRef),
                trx.get(dealRef),
                trx.get(adminDb.collection('repayments').where('dealId', '==', dealId)),
            ]);
            if (existingRequest.exists && existingRequest.data()?.status === 'Pending') {
                throw new Error('A termination request for this deal is already pending.');
            }
            if (!dealSnapshot.exists) {
                throw new Error('Deal not found.');
            }
            const deal = { id: dealSnapshot.id, ...dealSnapshot.data() } as Deal;
            if (deal.clientId !== clientId) {
                throw new Error('You are not allowed to terminate this deal.');
            }
            if (deal.status !== 'Active') {
                throw new Error('Only active deals can be terminated.');
            }
            const settlement = calculateRemainingRepaymentBalance(
                deal,
                repaymentsSnapshot.docs
                    .map((snapshot) => snapshot.data())
                    .filter((repayment) => repayment.status === 'Approved')
            );
            if (settlement.totalRemaining <= 0) {
                throw new Error('This deal has no remaining balance to settle.');
            }
            trx.set(requestRef, {
                dealId,
                dealName: deal.dealName || dealName,
                clientId,
                clientName,
                status: 'Pending',
                requestedAt: Timestamp.now(),
                remainingPrincipal: settlement.remainingPrincipal,
                remainingProfit: settlement.remainingProfit,
                settlementAmount: settlement.totalRemaining,
            });
            return settlement;
        });
        const formattedSettlement = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
        }).format(settlement.totalRemaining);

        await notifyAdmins(
            'Termination Request',
            `${clientName} requested to terminate "${dealName}". Full settlement due: ${formattedSettlement}.`,
            '/admin/approvals/terminations',
            'approval'
        );

        revalidatePath('/client/dashboard');

        return {
            success: true,
            message: `Your termination request has been sent for review. The full settlement due is ${formattedSettlement}, covering all unpaid principal and profit.`,
        };

    } catch (error) {
        console.error("TERMINATION REQUEST ERROR:", error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return { success: false, message: `Failed to submit request: ${message}` };
    }
}
