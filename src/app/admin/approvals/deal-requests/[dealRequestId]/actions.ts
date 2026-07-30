
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifyAdminWrite } from '@/lib/server/auth';

const formSchema = z.object({
  dealName: z.string().min(3),
  principal: z.coerce.number().positive(),
  profitRate: z.coerce.number().min(0),
  durationValue: z.coerce.number().positive().int(),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.literal('Equal Installments'),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
});

export async function approveDealAction(
    authToken: string,
    requestId: string,
    clientId: string,
    clientName: string,
    values: z.infer<typeof formSchema>
) {
  await verifyAdminWrite(authToken);
  if (!requestId) return { success: false, message: 'Request ID is missing.' };

  const validated = formSchema.safeParse(values);
  if (!validated.success) {
    return { success: false, message: 'Invalid data provided.' };
  }

  try {
    const requestRef = adminDb.collection('dealRequests').doc(requestId);
    await adminDb.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists || requestSnapshot.data()?.status !== 'Pending') {
        throw new Error('This deal request has already been processed.');
      }
      transaction.update(requestRef, { status: 'Approved', processedAt: FieldValue.serverTimestamp() });
      const newDealRef = adminDb.collection('deals').doc();
      const now = Timestamp.now();
      transaction.set(newDealRef, { ...validated.data, clientId, clientName, status: 'Pending', createdAt: now, startDate: now });
    });

    revalidatePath('/admin/approvals/deal-requests');
    revalidatePath('/admin/deals');

    return { success: true, message: 'Deal request approved and new deal created.' };
  } catch (error: any) {
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}

export async function rejectDealAction(authToken: string, requestId: string) {
  await verifyAdminWrite(authToken);
  if (!requestId) return { success: false, message: 'Request ID is missing.' };

  try {
    const requestRef = adminDb.collection('dealRequests').doc(requestId);
    await adminDb.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists || requestSnapshot.data()?.status !== 'Pending') {
        throw new Error('This deal request has already been processed.');
      }
      transaction.update(requestRef, { status: 'Rejected', processedAt: FieldValue.serverTimestamp() });
    });

    revalidatePath('/admin/approvals/deal-requests');
    return { success: true, message: 'Deal request has been rejected.' };
  } catch (error: any) {
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}
