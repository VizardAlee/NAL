
'use server';

import { notifyAdmins } from '@/app/common/actions/notification-actions';
import { adminDb } from '@/firebase/admin-app';
import { serverTimestamp } from 'firebase-admin/firestore';

export async function requestWithdrawalAction(userId: string, userName: string, amount: number) {
    try {
        await adminDb.collection('withdrawalRequests').add({
            investorId: userId,
            investorName: userName,
            amount,
            status: 'Pending',
            requestedAt: serverTimestamp(),
        });
        
        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        await notifyAdmins(
            'Withdrawal Request',
            `${userName} requested a withdrawal of ${formattedAmount}.`,
            '/admin/approvals/withdrawals'
        );
        
        return { success: true, message: `Your request to withdraw ${formattedAmount} has been submitted.` };
    } catch(error) {
        console.error("WITHDRAWAL REQUEST ACTION ERROR", error);
        return { success: false, message: "Failed to submit withdrawal request." };
    }
}
