'use server';

import { notifyAdmins, notifyUser } from '@/lib/server/notification-service';
import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { differenceInDays } from 'date-fns';
import { verifyAuthTokenForUser } from '@/lib/server/auth';
import { calculateAvailableProfit } from '@/lib/financial-integrity';
import { loadFundBatchAnniversaryWindow } from '@/lib/server/fund-batch-anniversary';

// --- Withdrawal Action ---
const withdrawalSchema = z.object({
    authToken: z.string().min(1, 'Authentication token is required.'),
    amount: z.coerce.number().positive("Amount must be a positive number."),
    userId: z.string().min(1, "User ID is required."),
    userName: z.string().min(1, "User name is required."),
    source: z.enum(['ShortTermProfit', 'AnniversaryProfit']).default('ShortTermProfit'),
});

function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function isDateInWindow(quarters: any[]): { open: boolean; label?: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const q of quarters) {
        const start = parseLocalDate(q.startDate);
        const end = parseLocalDate(q.endDate);
        end.setHours(23, 59, 59, 999);
        if (today >= start && today <= end) {
            return { open: true, label: q.label };
        }
    }
    return { open: false };
}

async function notifyWithdrawalSubmitted({
    userId,
    userName,
    formattedAmount,
    userLink,
    isCapitalWithdrawal = false,
}: {
    userId: string;
    userName: string;
    formattedAmount: string;
    userLink: string;
    isCapitalWithdrawal?: boolean;
}) {
    const withdrawalLabel = isCapitalWithdrawal ? 'capital withdrawal' : 'withdrawal';
    const deliveries = await Promise.allSettled([
        notifyAdmins(
            isCapitalWithdrawal ? 'Capital Withdrawal Request' : 'Withdrawal Request',
            isCapitalWithdrawal
                ? `${userName} requested to withdraw uninvested capital of ${formattedAmount}.`
                : `${userName} requested a withdrawal of ${formattedAmount}.`,
            '/admin/approvals/withdrawals',
            'approval'
        ),
        notifyUser(
            userId,
            'Withdrawal Request Submitted',
            `Your ${withdrawalLabel} request for ${formattedAmount} has been submitted and is awaiting administrator approval.`,
            userLink,
            'request-status'
        ),
    ]);

    deliveries.forEach((delivery, index) => {
        if (delivery.status === 'rejected') {
            const recipient = index === 0 ? 'administrators' : `investor ${userId}`;
            console.error(`Failed to deliver withdrawal notification to ${recipient}:`, delivery.reason);
        }
    });
}

export async function requestWithdrawalAction(prevState: any, formData: FormData) {
    const validatedFields = withdrawalSchema.safeParse({
        authToken: formData.get('authToken'),
        amount: formData.get('amount'),
        userId: formData.get('userId'),
        userName: formData.get('userName'),
        source: formData.get('source') || 'ShortTermProfit',
    });

    if (!validatedFields.success) {
        return { success: false, message: 'Invalid form data: ' + validatedFields.error.errors[0].message };
    }

    const { authToken, userId, userName, amount, source } = validatedFields.data;

    try {
        await verifyAuthTokenForUser(authToken, userId);
        const userSnap = await adminDb.collection('users').doc(userId).get();
        const userData = userSnap.data() as any;
        const isOwnerAccount = userData?.accessRole === 'OWNER';

        if (isOwnerAccount) {
            // 1. Check for custom withdrawal window
            const settingsSnap = await adminDb.doc('platformSettings/ownerWithdrawalWindow').get();
            const settingsData = settingsSnap.data();
            const quarters = settingsData?.quarters || [];

            const window = isDateInWindow(quarters);
            if (!window.open) {
                return {
                    success: false,
                    message: 'Withdrawals are currently closed. Please wait for an active withdrawal window.',
                };
            }

            // 2. Check for existing withdrawal request in this specific window (label)
            const existingOwnerWithdrawal = await adminDb
                .collection('withdrawalRequests')
                .where('investorId', '==', userId)
                .where('windowLabel', '==', window.label)
                .limit(1)
                .get();

            if (!existingOwnerWithdrawal.empty) {
                return {
                    success: false,
                    message: `You have already made a withdrawal request for the ${window.label} window. Owners are allowed one request per window.`,
                };
            }
        }

        // Check window again to get the label for reference
        let currentWindowLabel = null;
        if (isOwnerAccount) {
            const settingsSnap = await adminDb.doc('platformSettings/ownerWithdrawalWindow').get();
            const window = isDateInWindow(settingsSnap.data()?.quarters || []);
            currentWindowLabel = window.label;
        }

        await adminDb.runTransaction(async (trx) => {
            const anniversaryContext = await loadFundBatchAnniversaryWindow(trx, userId);
            const pendingRequests = anniversaryContext.withdrawalRequests.filter(
                (request) => request.status === 'Pending'
            );
            const investible = anniversaryContext.fundBatches.reduce(
                (sum, batch) => sum + Math.max(0, Number(batch.remainingAmount || 0)),
                0
            );
            const reserved = pendingRequests.reduce(
                (sum, request) => sum + Number(request.amount || 0),
                0
            );
            if (amount > investible - reserved + 0.01) {
                throw new Error('Amount exceeds your available investible balance after pending requests.');
            }
            if (!isOwnerAccount) {
                if (source === 'AnniversaryProfit') {
                    if (!anniversaryContext.window.isOpen) {
                        throw new Error('The annual five-day profit withdrawal window is currently closed.');
                    }
                    const globallyAvailableProfit = calculateAvailableProfit(anniversaryContext.entries);
                    const anniversaryAvailable = Math.min(
                        anniversaryContext.window.availableToWithdraw,
                        globallyAvailableProfit
                    );
                    if (amount > anniversaryAvailable + 0.01) {
                        throw new Error('Amount exceeds the remaining 20% allowance for this annual window.');
                    }
                } else {
                    const reservedProfit = pendingRequests
                        .filter((request) => request.source === 'ShortTermProfit' || request.type === 'InvestorWithdrawal')
                        .reduce((sum, request) => sum + Number(request.amount || 0), 0);
                    const availableProfit = calculateAvailableProfit(anniversaryContext.entries, reservedProfit);
                    if (amount > availableProfit + 0.01) {
                        throw new Error('Amount exceeds your available, unreserved profit.');
                    }
                }
            }
            const now = FieldValue.serverTimestamp();
            trx.create(adminDb.collection('withdrawalRequests').doc(), {
                investorId: userId,
                investorName: userName,
                amount,
                status: 'Pending',
                requestedAt: now,
                type: isOwnerAccount ? 'OwnerWithdrawal' : 'InvestorWithdrawal',
                source: isOwnerAccount ? 'OwnerProfit' : source,
                ...(source === 'AnniversaryProfit' ? {
                    anniversaryWindowIds: anniversaryContext.window.windowIds,
                    anniversaryYears: anniversaryContext.window.activeWindows.map((window) => ({
                        fundBatchId: window.fundBatchId,
                        year: window.anniversaryYear,
                    })),
                } : {}),
                ...(currentWindowLabel ? { windowLabel: currentWindowLabel } : {}),
            });
            trx.update(adminDb.collection('users').doc(userId), { lastWithdrawalDate: now });
        });

        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        await notifyWithdrawalSubmitted({
            userId,
            userName,
            formattedAmount,
            userLink: isOwnerAccount ? '/owner/dashboard' : '/investor/dashboard',
        });

        revalidatePath('/admin/approvals/withdrawals');
        revalidatePath('/investor/dashboard');
        revalidatePath('/owner/dashboard');

        return { success: true, message: `Your request to withdraw ${formattedAmount} has been submitted.` };
    } catch (error: any) {
        console.error("WITHDRAWAL REQUEST ACTION ERROR:", error);
        return {
            success: false,
            message: error?.message || "An unknown error occurred.",
            code: error?.code || 'internal',
            details: JSON.stringify(error)
        };
    }
}


// --- Reinvestment Action ---

const reinvestSchema = z.object({
    authToken: z.string().min(1, 'Authentication token is required.'),
    amount: z.coerce.number().positive("Amount must be a positive number."),
    userId: z.string().min(1, "User ID is required."),
    userName: z.string().min(1, "User name is required."),
});

export async function reinvestAction(input: { authToken: string; amount: number; userId: string; userName: string }): Promise<{ success: boolean; message: string; }> {

    const validatedFields = reinvestSchema.safeParse(input);

    if (!validatedFields.success) {
        return {
            success: false,
            message: 'Invalid input. Please try again.',
        };
    }

    const { authToken, amount, userId, userName } = validatedFields.data;

    try {
        await verifyAuthTokenForUser(authToken, userId);
        await adminDb.runTransaction(async (trx) => {
            const [anniversaryContext, requests] = await Promise.all([
                loadFundBatchAnniversaryWindow(trx, userId),
                trx.get(adminDb.collection('reinvestmentRequests').where('investorId', '==', userId)),
            ]);
            const reserved = requests.docs
                .filter((doc) => doc.data().status === 'Pending')
                .reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0);
            const available = calculateAvailableProfit(
                anniversaryContext.entries,
                reserved + anniversaryContext.window.reinvestmentReserve
            );
            if (amount > available + 0.01) {
                throw new Error('Amount exceeds your available, unreserved profit.');
            }
            trx.create(adminDb.collection('reinvestmentRequests').doc(), {
                investorId: userId,
                investorName: userName,
                amount,
                status: 'Pending',
                requestedAt: FieldValue.serverTimestamp(),
            });
        });

        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
        await notifyAdmins(
            'Reinvestment Request',
            `${userName} requested to reinvest ${formattedAmount}.`,
            '/admin/approvals/reinvestments',
            'approval'
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
    authToken: z.string().min(1, 'Authentication token is required.'),
    batchId: z.string().min(1),
    userId: z.string().min(1),
    userName: z.string().min(1),
});

export async function requestCapitalWithdrawalAction(input: z.infer<typeof capitalWithdrawalSchema>) {
    const validated = capitalWithdrawalSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid data provided.' };
    }

    const { authToken, batchId, userId, userName } = validated.data;
    const DURATION_IN_DAYS = { Days: 1, Weeks: 7, Fortnights: 14, Months: 30.4375, Years: 365.25 };

    try {
        await verifyAuthTokenForUser(authToken, userId);
        const batchRef = adminDb.collection('fundBatches').doc(batchId);
        const batchDoc = await batchRef.get();

        if (!batchDoc.exists) {
            throw new Error("Fund batch not found.");
        }
        const batchData = batchDoc.data()!;
        if (batchData.sourceId !== userId) {
            throw new Error("You are not allowed to withdraw this fund batch.");
        }

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
            details: `Withdrawal of uninvested short-term capital (Batch ID: ${batchId}).`,
            source: 'Capital',
        });

        await notifyWithdrawalSubmitted({
            userId,
            userName,
            formattedAmount,
            userLink: '/investor/dashboard',
            isCapitalWithdrawal: true,
        });

        revalidatePath('/investor/dashboard');
        revalidatePath('/admin/approvals/withdrawals');

        return { success: true, message: `Withdrawal request for ${formattedAmount} has been submitted.` };

    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "An unknown error occurred." };
    }
}
