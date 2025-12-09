
'use server';

import { adminDb } from '@/firebase/admin-app';
import { Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const requestDealSchema = z.object({
  dealName: z.string().min(3),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  principal: z.coerce.number().positive(),
  profitRate: z.coerce.number().min(0),
  durationValue: z.coerce.number().positive().int(),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.enum(['Equal Installments', 'Balloon Payment']),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
  proposalDetails: z.string().optional(),
  proposalPdf: z.string().optional(),
});

export async function requestDealAction(input: z.infer<typeof requestDealSchema>) {
    const validated = requestDealSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid data provided for deal request.' };
    }

    try {
        const dealRequestData = {
            ...validated.data,
            status: 'Pending',
            requestedAt: Timestamp.now(),
        };
        await adminDb.collection('dealRequests').add(dealRequestData);

        // Create a notification for all admins
        const adminQuery = await adminDb.collection('users').where('role', '==', 'Admin').get();
        const adminIds = adminQuery.docs.map(doc => doc.id);

        const batch = adminDb.batch();
        for (const adminId of adminIds) {
            const notificationRef = adminDb.collection('notifications').doc();
            batch.set(notificationRef, {
                recipientId: adminId,
                title: 'New Deal Request',
                message: `${validated.data.clientName} has requested a new deal: "${validated.data.dealName}"`,
                link: '/admin/approvals/deal-requests',
                read: false,
                createdAt: Timestamp.now(),
            });
        }
        await batch.commit();
        
        revalidatePath('/client/dashboard');
        revalidatePath('/admin/approvals/deal-requests');

        return { success: true, message: 'Your deal request has been submitted for review.' };

    } catch (error: any) {
        console.error('Request Deal Error:', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
