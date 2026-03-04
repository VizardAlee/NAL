
'use server';

import { adminDb } from '@/firebase/admin-app';
import { Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins } from '@/app/common/actions/notification-actions';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

const requestDealSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required.'),
  dealName: z.string().min(3),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  principal: z.coerce.number().positive(),
  profitRate: z.coerce.number().min(0),
  financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']).optional(),
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
        const { authToken, ...requestPayload } = validated.data;
        await verifyAuthTokenForUser(authToken, requestPayload.clientId);
        const dealRequestData = {
            ...requestPayload,
            status: 'Pending',
            requestedAt: Timestamp.now(),
        };
        await adminDb.collection('dealRequests').add(dealRequestData);

        await notifyAdmins(
            'New Deal Request',
            `${requestPayload.clientName} has requested a new deal: "${requestPayload.dealName}"`,
            '/admin/approvals/deal-requests'
        );
        
        revalidatePath('/client/dashboard');
        revalidatePath('/admin/approvals/deal-requests');

        return { success: true, message: 'Your deal request has been submitted for review.' };

    } catch (error: any) {
        console.error('Request Deal Error:', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
