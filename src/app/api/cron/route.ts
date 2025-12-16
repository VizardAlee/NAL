
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { addDays, differenceInDays, startOfDay } from 'date-fns';

const CRON_SECRET = process.env.CRON_SECRET;

// Helper function to get the Nisab value
async function getNisab(): Promise<number> {
    const settingsDoc = await adminDb.doc('platformSettings/zakat').get();
    return settingsDoc.data()?.nisab || 0;
}

// --- Zakat Automation Logic ---
async function processZakat() {
    const nisab = await getNisab();
    if (nisab <= 0) {
        console.log('Zakat processing skipped: Nisab not set.');
        return { processed: 0, skipped: 0, errors: 0, details: ['Zakat processing skipped: Nisab not set or is zero.'] };
    }

    const usersSnapshot = await adminDb.collection('users').where('role', '==', 'Investor').get();
    let processedCount = 0, errorCount = 0, skippedCount = 0;
    const details = [];

    for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        const userId = userDoc.id;

        try {
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
                skippedCount++;
                continue; // Not yet a year
            }

            const transactionsSnapshot = await adminDb.collection('transactions').where('userId', '==', userId).get();
            const portfolioValue = transactionsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

            if (portfolioValue < nisab) {
                skippedCount++;
                continue; // Below Nisab threshold
            }

            const zakatAmount = portfolioValue * 0.025;
            
            const batchesSnapshot = await adminDb.collection('fundBatches').where('sourceId', '==', userId).get();
            const investibleBalance = batchesSnapshot.docs.reduce((sum, doc) => sum + doc.data().remainingAmount, 0);

            if (investibleBalance < zakatAmount) {
                details.push(`Skipped Zakat for ${user.name} (${userId}): Insufficient investible balance.`);
                skippedCount++;
                continue;
            }

            await adminDb.runTransaction(async (transaction) => {
                let amountToDeduct = zakatAmount;
                const fundBatchesQuery = adminDb.collection('fundBatches').where('sourceId', '==', userId).where('remainingAmount', '>', 0).orderBy('createdAt', 'asc');
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

    return { processed: processedCount, skipped: skippedCount, errors: errorCount, details };
}

// --- Recovery & Legal Task Automation Logic ---
async function processRecoveryTasks() {
    let tasksCreated = 0, tasksEscalated = 0, clientNotificationsSent = 0, errors = 0;
    const details = [];

    const activeDealsSnapshot = await adminDb.collection('deals').where('status', '==', 'Active').get();

    for (const dealDoc of activeDealsSnapshot.docs) {
        const deal = dealDoc.data();
        const dealId = dealDoc.id;
        
        const approvedRepaymentsSnapshot = await adminDb.collection('repayments').where('dealId', '==', dealId).where('status', '==', 'Approved').get();
        const paidInstallmentNumbers = new Set(approvedRepaymentsSnapshot.docs.map(doc => doc.data().installmentNumber));

        const schedule = require('@/lib/amortization').generateAmortizationSchedule(deal);

        for (const installment of schedule) {
            if (paidInstallmentNumbers.has(installment.installment)) continue;

            const daysUntilDue = differenceInDays(installment.dueDate, new Date());
            const daysPastDue = -daysUntilDue;

            const taskQuery = adminDb.collection('recoveryTasks').where('repaymentId', '==', `${dealId}_${installment.installment}`).limit(1);
            const existingTaskSnapshot = await taskQuery.get();
            const taskExists = !existingTaskSnapshot.empty;
            const taskDoc = taskExists ? existingTaskSnapshot.docs[0] : null;

            // 1. Create Recovery Task (3 days before due)
            if (daysUntilDue === 3 && !taskExists) {
                try {
                    const clientDoc = await adminDb.collection('users').doc(deal.clientId).get();
                    if (!clientDoc.exists) continue;
                    const client = clientDoc.data()!;

                    await adminDb.collection('recoveryTasks').add({
                        clientId: deal.clientId,
                        clientName: client.name,
                        clientEmail: client.email,
                        clientPhoneNumber: client.phoneNumber || 'N/A',
                        dealId: dealId,
                        dealName: deal.dealName,
                        repaymentId: `${dealId}_${installment.installment}`,
                        amountDue: installment.payment,
                        dueDate: Timestamp.fromDate(installment.dueDate),
                        status: 'Due_Recovery',
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    });

                    // Send notification to client
                    const notify = require('@/app/common/actions/notification-actions').notifyUser;
                    await notify(
                        deal.clientId,
                        'Upcoming Payment Reminder',
                        `Your payment of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(installment.payment)} for "${deal.dealName}" is due in 3 days.`,
                        '/client/dashboard'
                    );

                    tasksCreated++;
                    clientNotificationsSent++;
                    details.push(`Created recovery task & notified client for deal ${dealId}, installment ${installment.installment}.`);
                } catch (e) {
                    errors++;
                    details.push(`Error creating task for deal ${dealId}, installment ${installment.installment}: ${e instanceof Error ? e.message : 'Unknown'}`);
                }
            }

            // 2. Escalate to Legal (7 days past due)
            if (daysPastDue >= 7 && taskDoc && taskDoc.data().status === 'Due_Recovery') {
                 try {
                    await taskDoc.ref.update({
                        status: 'Escalated_Legal',
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    tasksEscalated++;
                    details.push(`Escalated task for deal ${dealId}, installment ${installment.installment} to Legal.`);
                 } catch (e) {
                    errors++;
                    details.push(`Error escalating task for deal ${dealId}, installment ${installment.installment}: ${e instanceof Error ? e.message : 'Unknown'}`);
                 }
            }
        }
    }
    return { tasksCreated, tasksEscalated, clientNotificationsSent, errors, details };
}

// --- Main Cron Job Handler ---
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const [zakatResult, recoveryResult] = await Promise.all([
            processZakat(),
            processRecoveryTasks()
        ]);

        return NextResponse.json({
            success: true,
            message: 'Cron jobs executed successfully.',
            zakat: zakatResult,
            recovery: recoveryResult
        });
    } catch (error) {
        console.error('CRON JOB FAILED:', error);
        return NextResponse.json({ success: false, message: 'Cron job failed.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}
