
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { add, differenceInDays } from 'date-fns';

const CRON_SECRET = process.env.CRON_SECRET;

// Helper function to get the Nisab value
async function getNisab(): Promise<number> {
    const settingsDoc = await adminDb.doc('platformSettings/zakat').get();
    if (settingsDoc.exists) {
        return settingsDoc.data()?.nisab || 0;
    }
    return 0; // Default to 0 if not set
}

// --- Zakat Automation Logic ---
async function processZakat() {
    const nisab = await getNisab();
    if (nisab <= 0) {
        console.log('Zakat processing skipped: Nisab not set.');
        return { processed: 0, skipped: 0, errors: 0, details: [] };
    }

    const usersSnapshot = await adminDb.collection('users').where('role', '==', 'Investor').get();
    let processedCount = 0, errorCount = 0;
    const details = [];

    for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        const userId = userDoc.id;

        try {
            // Determine the base date for Zakat calculation (1 year anniversary)
            const lastPayment = user.lastZakatPaymentDate?.toDate();
            const firstDepositSnapshot = await adminDb.collection('transactions')
                .where('userId', '==', userId)
                .where('type', '==', 'Deposit')
                .orderBy('createdAt', 'asc')
                .limit(1)
                .get();
            
            const firstDepositDate = firstDepositSnapshot.empty ? null : firstDepositSnapshot.docs[0].data().createdAt.toDate();
            const baseDate = lastPayment || firstDepositDate;

            if (!baseDate || differenceInDays(new Date(), baseDate) < 365) {
                continue; // Not yet a year
            }

            // Calculate portfolio value
            const transactionsSnapshot = await adminDb.collection('transactions').where('userId', '==', userId).get();
            const portfolioValue = transactionsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

            if (portfolioValue < nisab) {
                continue; // Below Nisab threshold
            }

            const zakatAmount = portfolioValue * 0.025;
            
            // Check investible balance
            const batchesSnapshot = await adminDb.collection('fundBatches').where('sourceId', '==', userId).get();
            const investibleBalance = batchesSnapshot.docs.reduce((sum, doc) => sum + doc.data().remainingAmount, 0);

            if (investibleBalance < zakatAmount) {
                details.push(`Skipped Zakat for ${user.name} (${userId}): Insufficient investible balance.`);
                continue;
            }

            // --- Perform Zakat Transaction ---
            await adminDb.runTransaction(async (transaction) => {
                let amountToDeduct = zakatAmount;

                const fundBatchesQuery = adminDb.collection('fundBatches')
                    .where('sourceId', '==', userId)
                    .where('remainingAmount', '>', 0)
                    .orderBy('createdAt', 'asc');
                
                const userBatches = await transaction.get(fundBatchesQuery);
                
                for (const batchDoc of userBatches.docs) {
                    if (amountToDeduct <= 0) break;
                    const deduction = Math.min(amountToDeduct, batchDoc.data().remainingAmount);
                    transaction.update(batchDoc.ref, { remainingAmount: FieldValue.increment(-deduction) });
                    amountToDeduct -= deduction;
                }

                if (amountToDeduct > 0) throw new Error("Full Zakat amount could not be deducted.");

                const zakatTxRef = adminDb.collection('transactions').doc();
                transaction.set(zakatTxRef, {
                    userId: userId,
                    type: 'Zakat',
                    amount: -zakatAmount,
                    createdAt: FieldValue.serverTimestamp(),
                    details: 'Annual Zakat Payment (Automatic)'
                });

                // Also add to the general Zakat pool for tracking on the funds page
                const zakatPoolTxRef = adminDb.collection('transactions').doc();
                 transaction.set(zakatPoolTxRef, {
                    userId: 'zakat_pool',
                    type: 'Zakat',
                    amount: zakatAmount, // Positive amount for the pool
                    createdAt: FieldValue.serverTimestamp(),
                    details: `From ${user.name}`
                });

                transaction.update(userDoc.ref, { lastZakatPaymentDate: FieldValue.serverTimestamp() });
            });

            details.push(`Successfully processed Zakat for ${user.name} (${userId}) of ${zakatAmount}.`);
            processedCount++;

        } catch (error) {
            console.error(`Failed to process Zakat for ${userId}:`, error);
            errorCount++;
            details.push(`Error processing Zakat for ${user.name} (${userId}): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    return { processed: processedCount, skipped: usersSnapshot.size - processedCount - errorCount, errors: errorCount, details };
}

// --- Late Penalty Automation Logic ---
async function processLatePenalties() {
    let processedCount = 0, errorCount = 0;
    const details = [];
    const thirtyDaysAgo = add(new Date(), { days: -30 });

    const overdueRepaymentsQuery = adminDb.collection('repayments')
        .where('status', '==', 'Pending') // We only care about pending payments
        .where('dueDate', '<', thirtyDaysAgo);
        
    const overdueSnapshot = await overdueRepaymentsQuery.get();

    for (const repaymentDoc of overdueSnapshot.docs) {
        const repayment = repaymentDoc.data();
        try {
            // Check if a penalty for this installment for today has already been applied.
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const penaltyCheckQuery = adminDb.collection('transactions')
                .where('type', '==', 'Penalty')
                .where('details', '==', `Late fee for repayment ${repaymentDoc.id}`)
                .where('createdAt', '>=', today);
            
            const penaltyTodaySnapshot = await penaltyCheckQuery.get();

            if (!penaltyTodaySnapshot.empty) {
                details.push(`Skipped penalty for repayment ${repaymentDoc.id}: Already applied today.`);
                continue;
            }

            const penaltyAmount = repayment.amount * 0.01;

            // Create a "Penalty" transaction and deposit it into the Zakat pool
            const penaltyTxRef = adminDb.collection('transactions').doc();
            await penaltyTxRef.set({
                userId: 'zakat_pool',
                dealId: repayment.dealId,
                type: 'Penalty',
                amount: penaltyAmount, // Positive amount for the pool
                createdAt: FieldValue.serverTimestamp(),
                details: `Late fee for repayment ${repaymentDoc.id}`
            });
            
            // We are not adding the penalty to the user's debt directly,
            // but logging it as a separate transaction type into the Zakat Pool.
            // This simplifies accounting.

            details.push(`Applied 1% penalty of ${penaltyAmount} for overdue repayment ${repaymentDoc.id}.`);
            processedCount++;

        } catch (error) {
             console.error(`Failed to apply penalty for repayment ${repaymentDoc.id}:`, error);
            errorCount++;
            details.push(`Error applying penalty for repayment ${repaymentDoc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    return { processed: processedCount, errors: errorCount, details };
}


export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');

    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const zakatResult = await processZakat();
        const penaltyResult = await processLatePenalties();

        return NextResponse.json({
            success: true,
            message: 'Cron job executed successfully.',
            zakat: zakatResult,
            penalties: penaltyResult,
        });
    } catch (error) {
        console.error('CRON JOB FAILED:', error);
        return NextResponse.json({ success: false, message: 'Cron job failed.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
