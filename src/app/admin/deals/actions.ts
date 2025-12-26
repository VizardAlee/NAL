
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const formSchema = z.object({
  dealName: z.string().min(3, { message: 'Deal name must be at least 3 characters.' }),
  clientId: z.string({ required_error: 'Please select a client.' }),
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


export async function updateDealAction(dealId: string, clientName: string, values: z.infer<typeof formSchema>) {
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


export async function deleteDealAction(dealId: string) {
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

export async function approveManagementFeeAction(dealId: string) {
    if (!dealId) return { success: false, message: 'Deal ID is missing.' };
    
    try {
        const dealRef = adminDb.collection('deals').doc(dealId);
        const dealDoc = await dealRef.get();
        if (!dealDoc.exists) {
            return { success: false, message: 'Deal not found.'};
        }
        const dealData = dealDoc.data();
        if (!dealData) {
            return { success: false, message: 'Deal data is missing.' };
        }
        const { dealName, feeAmount, clientId, clientName } = dealData;
        const managementFeeAmount = dealData.managementFeeAmount || 0;
        
        if (managementFeeAmount <= 0) return { success: false, message: 'Fee amount is invalid.' };

        const batch = adminDb.batch();
        
        // 1. Mark the fee as paid on the deal
        batch.update(dealRef, { managementFeePaid: true });

        // 2. Create an administrative transaction for the income
        const adminTxRef = adminDb.collection('administrativeTransactions').doc();
        batch.set(adminTxRef, {
            type: 'ManagementFee',
            amount: managementFeeAmount,
            description: `Management fee for deal: ${dealData.dealName}`,
            createdAt: FieldValue.serverTimestamp(),
            dealId: dealId,
            dealName: dealData.dealName,
            clientId: dealData.clientId,
            clientName: dealData.clientName,
        });
        
        await batch.commit();
        
        revalidatePath(`/admin/deals/${dealId}`);
        revalidatePath('/admin/funds');
        
        return { success: true, message: 'Management fee approved and recorded.' };
    } catch (error: any) {
        console.error("Management Fee Approval Error: ", error);
        return { success: false, message: error.message || 'An unknown error occurred.' };
    }
}
