
'use server';

import { notifyAdmins } from '@/app/common/actions/notification-actions';
import { adminDb } from '@/firebase/admin-app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addQuarters, differenceInDays, startOfQuarter } from 'date-fns';

// --- Withdrawal Action ---
const withdrawalSchema = z.object({
    amount: z.coerce.number().positive("Amount must be a positive number."),
    userId: z.string().min(1, "User ID is required."),
    userName: z.string().min(1, "User name is required."),
});

export async function requestWithdrawalAction(prevState: any, formData: FormData) {
    const validatedFields = withdrawalSchema.safeParse({
        amount: formData.get('amount'),
        userId: formData.get('userId'),
        userName: formData.get('userName'),
    });

    if (!validatedFields.success) {
        return { success: false, message: 'Invalid form data.' };
    }

    const { userId, userName, amount } = validatedFields.data;

    try {
        const userSnap = await adminDb.collection('users').doc(userId).get();
        const userData = userSnap.data() as any;
        const isOwnerAccount = userData?.accessRole === 'OWNER';

        if (isOwnerAccount) {
            const quarterStart = startOfQuarter(new Date());
            const nextQuarterStart = addQuarters(quarterStart, 1);
            const existingOwnerWithdrawal = await adminDb
                .collection('withdrawalRequests')
                .where('investorId', '==', userId)
                .where('requestedAt', '>=', Timestamp.fromDate(quarterStart))
                .where('requestedAt', '<', Timestamp.fromDate(nextQuarterStart))
                .limit(1)
                .get();

            if (!existingOwnerWithdrawal.empty) {
                return {
                    success: false,
                    message: 'Owner withdrawals are allowed once per quarter. You already made a withdrawal request this quarter.',
                };
            }
        }

        const batch = adminDb.batch();
        const now = FieldValue.serverTimestamp();

        // 1. Create the withdrawal request
        const requestRef = adminDb.collection('withdrawalRequests').doc();
        batch.set(requestRef, {
            investorId: userId,
            investorName: userName,
            amount,
            status: 'Pending',
            requestedAt: now,
            type: isOwnerAccount ? 'OwnerWithdrawal' : 'InvestorWithdrawal',
        });

        // 2. Update the user's last withdrawal date
        const userRef = adminDb.collection('users').doc(userId);
        batch.update(userRef, {
            lastWithdrawalDate: now,
        });

        await batch.commit();

        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        await notifyAdmins(
            'Withdrawal Request',
            `${userName} requested a withdrawal of ${formattedAmount}.`,
            '/admin/approvals/withdrawals'
        );

        revalidatePath('/admin/approvals/withdrawals');
        revalidatePath('/investor/dashboard');

        return { success: true, message: `Your request to withdraw ${formattedAmount} has been submitted.` };
    } catch (error) {
        console.error("WITHDRAWAL REQUEST ACTION ERROR:", error);
        return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
    }
}


// --- Reinvestment Action ---

const reinvestSchema = z.object({
    amount: z.coerce.number().positive("Amount must be a positive number."),
    userId: z.string().min(1, "User ID is required."),
    userName: z.string().min(1, "User name is required."),
});

export async function reinvestAction(input: { amount: number; userId: string, userName: string }): Promise<{ success: boolean; message: string; }> {

    const validatedFields = reinvestSchema.safeParse(input);

    if (!validatedFields.success) {
        return {
            success: false,
            message: 'Invalid input. Please try again.',
        };
    }

    const { amount, userId, userName } = validatedFields.data;

    try {

        await adminDb.collection('reinvestmentRequests').add({
            investorId: userId,
            investorName: userName,
            amount: amount,
            status: 'Pending',
            requestedAt: FieldValue.serverTimestamp(),
        });

        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        await notifyAdmins(
            'Reinvestment Request',
            `${userName} requested to reinvest ${formattedAmount}.`,
            '/admin/approvals/reinvestments'
        );

        revalidatePath('/investor/dashboard');
        revalidatePath('/admin/approvals/reinvestments');

        return {
            success: true,
            message: `Successfully requested to reinvest ${formattedAmount}. An admin will approve it shortly.`,
        };
    } catch (error) {
        console.error('REINVESTMENT REQUEST ERROR:', error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        return {
            success: false,
            message: `Failed to request reinvestment: ${message}`,
        };
    }
}

// --- Uninvested Capital Withdrawal ---

const capitalWithdrawalSchema = z.object({
    batchId: z.string().min(1),
    userId: z.string().min(1),
    userName: z.string().min(1),
});

export async function requestCapitalWithdrawalAction(input: z.infer<typeof capitalWithdrawalSchema>) {
    const validated = capitalWithdrawalSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid data provided.' };
    }

    const { batchId, userId, userName } = validated.data;
    const DURATION_IN_DAYS = { Days: 1, Weeks: 7, Fortnights: 14, Months: 30.4375, Years: 365.25 };

    try {
        const batchRef = adminDb.collection('fundBatches').doc(batchId);
        const batchDoc = await batchRef.get();

        if (!batchDoc.exists) {
            throw new Error("Fund batch not found.");
        }
        const batchData = batchDoc.data()!;

        // Server-side validation
        const isShortTerm = (batchData.tenureValue * (DURATION_IN_DAYS[batchData.tenureUnit as keyof typeof DURATION_IN_DAYS] || 0)) <= (12 * 30.4375);
        const isUninvested = batchData.amount === batchData.remainingAmount;
        const isOverOneMonthOld = differenceInDays(new Date(), batchData.createdAt.toDate()) > 30;

        if (!(isShortTerm && isUninvested && isOverOneMonthOld)) {
            return { success: false, message: "This fund batch is not eligible for withdrawal." };
        }

        const amount = batchData.amount;
        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

        // This action does not delete the batch. It creates a request for an admin to approve.
        await adminDb.collection('withdrawalRequests').add({
            investorId: userId,
            investorName: userName,
            amount: amount,
            status: 'Pending',
            requestedAt: FieldValue.serverTimestamp(),
            details: `Withdrawal of uninvested short-term capital (Batch ID: ${batchId}).`
        });

        await notifyAdmins(
            'Capital Withdrawal Request',
            `${userName} requested to withdraw uninvested capital of ${formattedAmount}.`,
            '/admin/approvals/withdrawals'
        );

        revalidatePath('/investor/dashboard');
        revalidatePath('/admin/approvals/withdrawals');

        return { success: true, message: `Withdrawal request for ${formattedAmount} has been submitted.` };

    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
    }
}
