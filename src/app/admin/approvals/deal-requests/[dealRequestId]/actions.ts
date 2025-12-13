
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const formSchema = z.object({
  dealName: z.string().min(3),
  principal: z.coerce.number().positive(),
  profitRate: z.coerce.number().min(0),
  durationValue: z.coerce.number().positive().int(),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.enum(['Equal Installments', 'Balloon Payment']),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
});

export async function approveDealAction(
    requestId: string,
    clientId: string,
    clientName: string,
    values: z.infer<typeof formSchema>
) {
  if (!requestId) return { success: false, message: 'Request ID is missing.' };

  const validated = formSchema.safeParse(values);
  if (!validated.success) {
    return { success: false, message: 'Invalid data provided.' };
  }

  try {
    const batch = adminDb.batch();
    const requestRef = adminDb.collection('dealRequests').doc(requestId);
    
    // 1. Update the original request
    batch.update(requestRef, {
      status: 'Approved',
      processedAt: FieldValue.serverTimestamp(),
    });

    // 2. Create the new deal with potentially modified values
    const newDealRef = adminDb.collection('deals').doc();
    const now = Timestamp.now();
    batch.set(newDealRef, {
      ...validated.data,
      clientId,
      clientName,
      status: 'Pending', // New deals start as Pending until funded
      createdAt: now,
      startDate: now, // Default start date to now, can be edited later
    });

    await batch.commit();

    revalidatePath('/admin/approvals/deal-requests');
    revalidatePath('/admin/deals');

    return { success: true, message: 'Deal request approved and new deal created.' };
  } catch (error: any) {
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}

export async function rejectDealAction(requestId: string) {
  if (!requestId) return { success: false, message: 'Request ID is missing.' };

  try {
    const requestRef = adminDb.collection('dealRequests').doc(requestId);
    await requestRef.update({
      status: 'Rejected',
      processedAt: FieldValue.serverTimestamp(),
    });

    revalidatePath('/admin/approvals/deal-requests');
    return { success: true, message: 'Deal request has been rejected.' };
  } catch (error: any) {
    return { success: false, message: error.message || 'An unknown error occurred.' };
  }
}
