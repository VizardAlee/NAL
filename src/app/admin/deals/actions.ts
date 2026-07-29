
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { verifyAdminWrite } from '@/lib/server/auth';

const formSchema = z.object({
  dealName: z.string().min(3, { message: 'Deal name must be at least 3 characters.' }),
  clientId: z.string({ required_error: 'Please select a client.' }),
  marketerId: z.string().optional(),
  principal: z.coerce.number().positive({ message: 'Principal must be a positive number.' }),
  profitRate: z.coerce.number().min(0, { message: 'Profit rate cannot be negative.' }),
  managementFeeRate: z.coerce.number().min(0, { message: 'Management fee rate cannot be negative.' }),
  financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']).optional(),
  durationValue: z.coerce.number().positive().int({ message: 'Duration must be a positive number.' }),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.enum(['Equal Installments', 'Balloon Payment']),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
  startDate: z.date().optional(),
});

export async function createDealAction(authToken: string, clientName: string, values: z.infer<typeof formSchema>) {
    await verifyAdminWrite(authToken);
    const validated = formSchema.safeParse(values);
    if (!validated.success) {
        return {
            success: false,
            message: 'Invalid data provided for deal creation.',
            details: validated.error.flatten(),
        };
    }

    const { principal, managementFeeRate, startDate, ...restOfData } = validated.data;
    const managementFeeAmount = (principal * managementFeeRate) / 100;

    try {
        const dealRef = await adminDb.collection('deals').add({
            ...restOfData,
            clientName,
            principal,
            managementFeeRate,
            managementFeeAmount,
            managementFeePaid: false,
            status: 'Pending',
            createdAt: FieldValue.serverTimestamp(),
            startDate: startDate || FieldValue.serverTimestamp(),
        });

        revalidatePath('/admin/deals');

        return {
            success: true,
            message: 'Deal created successfully.',
            dealId: dealRef.id,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred while creating the deal.';
        console.error('Create Deal Action Error:', error);
        return {
            success: false,
            message,
            details: error instanceof Error ? { name: error.name, message: error.message } : { error: String(error) },
        };
    }
}


export async function updateDealAction(authToken: string, dealId: string, clientName: string, values: z.infer<typeof formSchema>) {
    await verifyAdminWrite(authToken);
    if (!dealId) {
        return { success: false, message: 'Deal ID is missing.' };
    }

    const validated = formSchema.safeParse(values);
    if (!validated.success) {
        return { success: false, message: 'Invalid data provided.' };
    }
    
    const { principal, managementFeeRate, ...restOfData } = validated.data;
    const managementFeeAmount = (principal * managementFeeRate) / 100;

    try {
        const dealRef = adminDb.collection('deals').doc(dealId);
        await dealRef.update({
            ...restOfData,
            principal,
            managementFeeRate,
            managementFeeAmount,
            clientName, // Keep client name in sync
            startDate: validated.data.startDate ? validated.data.startDate : FieldValue.serverTimestamp()
        });

        revalidatePath('/admin/deals');
        revalidatePath(`/admin/deals/${dealId}`);

        return { success: true, message: 'Deal updated successfully.' };
    } catch (error: any) {
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}


export async function deleteDealAction(authToken: string, dealId: string) {
    await verifyAdminWrite(authToken);
    if (!dealId) {
        return { success: false, message: 'Deal ID is missing.' };
    }

    try {
        // A deal can only be deleted if it has no investments.
        // This is a server-side safeguard.
        const investmentsSnapshot = await adminDb.collection('investments').where('dealId', '==', dealId).limit(1).get();

        if (!investmentsSnapshot.empty) {
            return { success: false, message: 'Cannot delete a deal that has already been funded or partially funded.' };
        }

        await adminDb.collection('deals').doc(dealId).delete();

        revalidatePath('/admin/deals');

        return { success: true, message: 'Deal deleted successfully.' };
    } catch (error: any) {
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}

export async function approveManagementFeeAction(authToken: string, dealId: string) {
    await verifyAdminWrite(authToken);
    if (!dealId) return { success: false, message: 'Deal ID is missing.' };
    
    try {
        const dealRef = adminDb.collection('deals').doc(dealId);
        await adminDb.runTransaction(async (transaction) => {
            const dealDoc = await transaction.get(dealRef);
            if (!dealDoc.exists) throw new Error('Deal not found.');
            const dealData = dealDoc.data()!;
            const managementFeeAmount = Number(dealData.managementFeeAmount || 0);
            if (managementFeeAmount <= 0) throw new Error('Fee amount is invalid.');
            if (dealData.managementFeePaid === true) throw new Error('Management fee has already been approved.');
            transaction.update(dealRef, { managementFeePaid: true });
            transaction.set(adminDb.collection('administrativeTransactions').doc(), {
                type: 'ManagementFee', amount: managementFeeAmount,
                description: `Management fee for deal: ${dealData.dealName}`,
                createdAt: FieldValue.serverTimestamp(), dealId,
                dealName: dealData.dealName, clientId: dealData.clientId, clientName: dealData.clientName,
                sourceRequestId: `management-fee:${dealId}`,
            });
        });
        
        revalidatePath(`/admin/deals/${dealId}`);
        revalidatePath('/admin/funds');
        
        return { success: true, message: 'Management fee approved and recorded.' };
    } catch (error: any) {
        console.error("Management Fee Approval Error: ", error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
