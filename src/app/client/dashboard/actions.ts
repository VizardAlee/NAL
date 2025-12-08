
'use server';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

async function createNotification(firestore: FirebaseFirestore.Firestore, title: string, message: string, link: string) {
    const adminQuery = await firestore.collection('users').where('role', '==', 'Admin').get();
    const adminIds = adminQuery.docs.map(doc => doc.id);

    const batch = firestore.batch();
    for (const adminId of adminIds) {
        const notificationRef = firestore.collection('notifications').doc();
        batch.set(notificationRef, {
            recipientId: adminId,
            title,
            message,
            link,
            read: false,
            createdAt: Timestamp.now(),
        });
    }
    await batch.commit();
}

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
    const { firestore } = initializeFirebase();
    const lodgedAt = Timestamp.now();
    const dueDateTimestamp = Timestamp.fromDate(new Date(dueDate));
    
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
    await createNotification(
        firestore,
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
      message: `Payment of ${formattedAmount} has been submitted.`,
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

    const { dealId, dealName, clientId, clientName } = validatedFields.data;
    
    try {
        const { firestore } = initializeFirebase();

        const existingReqQuery = await firestore.collection('terminationRequests')
            .where('dealId', '==', dealId)
            .where('status', '==', 'Pending')
            .limit(1)
            .get();
        
        if (!existingReqQuery.empty) {
            return { success: false, message: "A termination request for this deal is already pending." };
        }

        await firestore.collection('terminationRequests').add({
            dealId,
            dealName,
            clientId,
            clientName,
            status: 'Pending',
            requestedAt: Timestamp.now(),
        });

        await createNotification(
            firestore,
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
