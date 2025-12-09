
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

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
        
        const managementFeeAmount = dealData.managementFeeAmount || 0;
        if (managementFeeAmount <= 0) {
            return { success: false, message: 'Fee amount is invalid or zero.' };
        }

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
