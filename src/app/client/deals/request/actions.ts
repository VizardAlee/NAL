
'use server';

import { adminDb } from '@/firebase/admin-app';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { notifyAdmins } from '@/lib/server/notification-service';
import { verifyPersonaForUser } from '@/lib/server/auth';
import { createPendingCustomerRequest } from '@/lib/server/customer-request';

const requestDealSchema = z.object({
  authToken: z.string().min(1, 'Authentication token is required.'),
  dealName: z.string().min(3),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  principal: z.coerce.number().finite().positive(),
  profitRate: z.coerce.number().finite().min(0),
  financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']).optional(),
  guarantorName: z.string().trim().min(2),
  guarantorAddress: z.string().trim().min(5),
  guarantorPhoneNumber: z.string().trim().min(7),
  guarantorOccupation: z.string().trim().min(2),
  guarantorPhotoURL: z.string().url().refine(
    (url) => url.startsWith('https://firebasestorage.googleapis.com/'),
    'Guarantor photograph must be stored in Firebase Storage.'
  ),
  durationValue: z.coerce.number().finite().positive().int(),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.literal('Equal Installments'),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
  proposalDetails: z.string().optional(),
  proposalPdf: z.string().url().refine(
    (url) => url.startsWith('https://firebasestorage.googleapis.com/'),
    'Proposal must be stored in Firebase Storage.'
  ).optional(),
});

export async function requestDealAction(input: z.infer<typeof requestDealSchema>) {
    const validated = requestDealSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid data provided for deal request.' };
    }

    try {
        const { authToken, ...requestPayload } = validated.data;
        await verifyPersonaForUser(authToken, requestPayload.clientId, 'CLIENT');
        const profile = (await adminDb.collection('users').doc(requestPayload.clientId).get()).data()!;
        requestPayload.clientName = String(profile.name || 'Client');
        const submission = await createPendingCustomerRequest(adminDb, 'dealRequests', requestPayload.clientId, requestPayload);
        if (!submission.created) return { success: true, message: 'This financing request is already awaiting review.' };

        await notifyAdmins(
            'New Deal Request',
            `${requestPayload.clientName} has requested a new deal: "${requestPayload.dealName}"`,
            '/admin/approvals/deal-requests',
            'approval'
        ).catch(error => console.warn('Financing request saved but administrator notification failed.', error));
        
        revalidatePath('/client/dashboard');
        revalidatePath('/admin/approvals/deal-requests');

        return { success: true, message: 'Your deal request has been submitted for review.' };

    } catch (error: any) {
        console.error('Request Deal Error:', error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
