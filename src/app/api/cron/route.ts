
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase/admin-app';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { differenceInDays, isBefore, isEqual } from 'date-fns';
import { processOwnerProfitAllocations } from '@/lib/server/owner-profit';
import { notifyAdmins, notifyUser } from '@/lib/server/notification-service';
import { hasPersona } from '@/lib/access-control';
import { isZakatApplicable } from '@/lib/zakat-eligibility';
import { calculateInvestorPortfolioValue, roundCurrency } from '@/lib/financial-integrity';
import { calculateZakatAmount, isZakatDue } from '@/lib/zakat';

const CRON_SECRET = process.env.CRON_SECRET;

// Helper function to get the Nisab value
async function getNisab(): Promise<number> {
    const settingsDoc = await adminDb.doc('platformSettings/zakat').get();
    const nisab = Number(settingsDoc.data()?.nisab || 0);
    return Number.isFinite(nisab) ? nisab : 0;
}

// --- Zakat Automation Logic ---
async function processZakat() {
    const nisab = await getNisab();
    if (nisab <= 0) {
        console.log('Zakat processing skipped: Nisab not set.');
        return { processed: 0, skipped: 0, errors: 0, details: ['Zakat processing skipped: Nisab not set or is zero.'] };
    }

    const usersSnapshot = await adminDb.collection('users').get();
    const investorDocs = usersSnapshot.docs.filter((doc) => isZakatApplicable(doc.data()));
    let processedCount = 0, errorCount = 0, skippedCount = 0;
    const details = [];

    for (const userDoc of investorDocs) {
        const user = userDoc.data();
        const userId = userDoc.id;

        try {
            const lastPayment = user.lastZakatPaymentDate?.toDate();
            const lastAssessment = user.lastZakatAssessmentDate?.toDate?.() || lastPayment;
            const firstDepositSnapshot = await adminDb.collection('transactions')
                .where('userId', '==', userId)
                .where('type', '==', 'Deposit')
                .orderBy('createdAt', 'asc')
                .limit(1)
                .get();
            
            const firstDepositDate = firstDepositSnapshot.empty ? null : firstDepositSnapshot.docs[0].data().createdAt.toDate();
            if (!isZakatDue({ firstDepositDate, lastAssessmentDate: lastAssessment })) {
                skippedCount++;
                continue; // Not yet a year
            }

            const transactionsSnapshot = await adminDb.collection('transactions').where('userId', '==', userId).get();
            const portfolioValue = calculateInvestorPortfolioValue(
                transactionsSnapshot.docs.map((doc) => doc.data())
            );

            const zakatAmount = calculateZakatAmount(portfolioValue, nisab);
            if (zakatAmount <= 0) {
                // An annual assessment below Nisab is complete even though no
                // payment is due. Record it so the next assessment is annual.
                await adminDb.runTransaction(async (transaction) => {
                    const currentUserSnapshot = await transaction.get(userDoc.ref);
                    if (!currentUserSnapshot.exists || !isZakatApplicable(currentUserSnapshot.data())) return;
                    const currentUser = currentUserSnapshot.data();
                    const currentAssessment = currentUser?.lastZakatAssessmentDate?.toDate?.()
                        || currentUser?.lastZakatPaymentDate?.toDate?.()
                        || null;
                    if (isZakatDue({ firstDepositDate, lastAssessmentDate: currentAssessment })) {
                        transaction.update(userDoc.ref, { lastZakatAssessmentDate: FieldValue.serverTimestamp() });
                    }
                });
                skippedCount++;
                continue; // Below Nisab threshold
            }
            
            const batchesSnapshot = await adminDb.collection('fundBatches').where('sourceId', '==', userId).get();
            const investibleBalance = roundCurrency(
                batchesSnapshot.docs.reduce((sum, doc) => sum + Number(doc.data().remainingAmount || 0), 0)
            );

            if (investibleBalance < zakatAmount) {
                details.push(`Skipped Zakat for ${user.name} (${userId}): Insufficient investible balance.`);
                skippedCount++;
                const shouldNotify = await adminDb.runTransaction(async (transaction) => {
                    const currentUserSnapshot = await transaction.get(userDoc.ref);
                    if (!currentUserSnapshot.exists || !isZakatApplicable(currentUserSnapshot.data())) return false;
                    const lastNotice = currentUserSnapshot.data()?.lastZakatFundingNoticeDate?.toDate?.() || null;
                    if (lastNotice && differenceInDays(new Date(), lastNotice) < 7) return false;
                    transaction.update(userDoc.ref, { lastZakatFundingNoticeDate: FieldValue.serverTimestamp() });
                    return true;
                });
                if (shouldNotify) {
                    const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(zakatAmount);
                    await Promise.allSettled([
                        notifyUser(
                            userId,
                            'Zakat payment requires available funds',
                            `${formattedAmount} is due for annual Zakat, but your currently investible balance is insufficient. No deduction was made.`,
                            '/investor/transactions',
                            'system'
                        ),
                        notifyAdmins(
                            'Zakat payment needs attention',
                            `${user.name || userId} has ${formattedAmount} due for Zakat but insufficient investible funds. No deduction was made.`,
                            `/admin/users/${userId}`,
                            'system'
                        ),
                    ]);
                }
                continue;
            }

            const deducted = await adminDb.runTransaction(async (transaction) => {
                let amountToDeduct = zakatAmount;
                const currentUserSnapshot = await transaction.get(userDoc.ref);
                if (!currentUserSnapshot.exists || !isZakatApplicable(currentUserSnapshot.data())) {
                    throw new Error('Zakat applies only to investors explicitly registered as Muslim.');
                }

                // This read is the idempotency guard. If two scheduler attempts overlap,
                // Firestore retries the loser and it sees that this annual payment is done.
                const currentUser = currentUserSnapshot.data();
                const currentLastAssessment = currentUser?.lastZakatAssessmentDate?.toDate?.()
                    || currentUser?.lastZakatPaymentDate?.toDate?.()
                    || null;
                if (!isZakatDue({ firstDepositDate, lastAssessmentDate: currentLastAssessment })) {
                    return false;
                }

                const fundBatchesQuery = adminDb.collection('fundBatches').where('sourceId', '==', userId).where('remainingAmount', '>', 0).orderBy('createdAt', 'asc');
                const userBatches = await transaction.get(fundBatchesQuery);
                
                for (const batchDoc of userBatches.docs) {
                    if (amountToDeduct <= 0) break;
                    const deduction = roundCurrency(Math.min(amountToDeduct, Number(batchDoc.data().remainingAmount || 0)));
                    transaction.update(batchDoc.ref, { remainingAmount: FieldValue.increment(-deduction) });
                    amountToDeduct = roundCurrency(amountToDeduct - deduction);
                }

                if (amountToDeduct > 0) throw new Error("Full Zakat amount could not be deducted.");

                const zakatTxRef = adminDb.collection('transactions').doc();
                transaction.set(zakatTxRef, {
                    userId: userId,
                    type: 'Zakat',
                    amount: -zakatAmount,
                    createdAt: FieldValue.serverTimestamp(),
                    details: 'Annual Zakat Payment (Automatic)',
                    metadata: {
                        rate: 0.025,
                        nisab,
                        portfolioValue,
                        mode: 'automatic',
                    },
                });

                transaction.update(userDoc.ref, {
                    lastZakatAssessmentDate: FieldValue.serverTimestamp(),
                    lastZakatPaymentDate: FieldValue.serverTimestamp(),
                    lastZakatFundingNoticeDate: FieldValue.delete(),
                });
                return true;
            });

            if (!deducted) {
                skippedCount++;
                continue;
            }

            details.push(`Successfully processed Zakat for ${user.name} (${userId}) of ${zakatAmount}.`);
            processedCount++;
            try {
                await notifyUser(
                    userId,
                    'Annual Zakat processed',
                    `${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(zakatAmount)} was deducted from your portfolio for annual Zakat.`,
                    '/investor/transactions',
                    'system'
                );
            } catch (notificationError) {
                // The financial transaction is already final. A notification
                // outage must never make the scheduler retry the deduction.
                console.error(`Zakat notification failed for ${userId}:`, notificationError);
                details.push(`Zakat was processed for ${userId}, but its notification could not be delivered.`);
            }

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
    let tasksCreated = 0, tasksEscalated = 0, clientNotificationsSent = 0, adminOverdueNotificationsSent = 0, adminOverdueNotificationsSkipped = 0, errors = 0;
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
                    await notifyUser(
                        deal.clientId,
                        'Upcoming Payment Reminder',
                        `Your payment of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(installment.payment)} for "${deal.dealName}" is due in 3 days.`,
                        '/client/dashboard',
                        'repayment'
                    );

                    tasksCreated++;
                    clientNotificationsSent++;
                    details.push(`Created recovery task & notified client for deal ${dealId}, installment ${installment.installment}.`);
                } catch (e) {
                    errors++;
                    details.push(`Error creating task for deal ${dealId}, installment ${installment.installment}: ${e instanceof Error ? e.message : 'Unknown'}`);
                }
            }

            // 1b. Notify admins for overdue unpaid installments (deduplicated per installment per day).
            if (daysPastDue >= 1) {
                try {
                    const repaymentKey = `${dealId}_${installment.installment}`;
                    const dayKey = new Date().toISOString().slice(0, 10);
                    const alertRef = adminDb.collection('systemNotifications').doc(`overdue_${repaymentKey}_${dayKey}`);
                    const existingAlert = await alertRef.get();

                    if (existingAlert.exists) {
                        adminOverdueNotificationsSkipped++;
                    } else {
                        const formattedAmount = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(installment.payment);
                        const clientLabel = deal.clientName || deal.clientId || 'Unknown client';

                        await notifyAdmins(
                            'Overdue Payment Alert',
                            `${clientLabel} is ${daysPastDue} day(s) overdue on ${formattedAmount} for "${deal.dealName}".`,
                            '/admin/approvals/repayments',
                            'overdue'
                        );

                        await alertRef.set({
                            type: 'OverduePaymentAlert',
                            dealId,
                            dealName: deal.dealName || null,
                            repaymentId: repaymentKey,
                            installmentNumber: installment.installment,
                            dueDate: Timestamp.fromDate(installment.dueDate),
                            amountDue: installment.payment,
                            daysPastDue,
                            createdAt: FieldValue.serverTimestamp(),
                        });

                        adminOverdueNotificationsSent++;
                        details.push(`Sent overdue admin alert for deal ${dealId}, installment ${installment.installment} (${daysPastDue} day(s) past due).`);
                    }
                } catch (e) {
                    errors++;
                    details.push(`Error sending overdue admin alert for deal ${dealId}, installment ${installment.installment}: ${e instanceof Error ? e.message : 'Unknown'}`);
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
    return { tasksCreated, tasksEscalated, clientNotificationsSent, adminOverdueNotificationsSent, adminOverdueNotificationsSkipped, errors, details };
}

// --- Marketer Rating Automation Logic ---
async function processMarketerRatings() {
  let marketersProcessed = 0;
  let errors = 0;
  const details = [];

  const usersSnapshot = await adminDb.collection('users').get();
  const marketers = usersSnapshot.docs.filter((doc) => hasPersona(doc.data(), 'MARKETER'));
  if (marketers.length === 0) {
    return { processed: 0, errors: 0, details: ['No marketers found.'] };
  }

  for (const marketerDoc of marketers) {
    const marketer = marketerDoc.data();
    const marketerId = marketerDoc.id;
    let totalPayments = 0;
    let onTimePayments = 0;
    let totalDeals = 0;

    try {
      const referredClientsSnapshot = await adminDb.collection('users').where('referredByCode', '==', marketer.referralCode).get();
      const referredClientIds = referredClientsSnapshot.docs
        .filter((doc) => hasPersona(doc.data(), 'CLIENT'))
        .map(doc => doc.id);

      const dealsToScore: Set<string> = new Set();
      referredClientIds.forEach(id => dealsToScore.add(id));

      if (dealsToScore.size > 0) {
        const dealsSnapshot = await adminDb.collection('deals').where('clientId', 'in', Array.from(dealsToScore)).get();
        totalDeals = dealsSnapshot.size;

        for (const dealDoc of dealsSnapshot.docs) {
          const repaymentsSnapshot = await adminDb.collection('repayments').where('dealId', '==', dealDoc.id).where('status', '==', 'Approved').get();
          
          repaymentsSnapshot.forEach(repaymentDoc => {
            const repayment = repaymentDoc.data();
            totalPayments++;
            const dueDate = repayment.dueDate.toDate();
            const lodgedAt = repayment.lodgedAt.toDate();
            if (isEqual(lodgedAt, dueDate) || isBefore(lodgedAt, dueDate)) {
              onTimePayments++;
            }
          });
        }
      }

      // Calculate rating: 5-star scale based on on-time payment percentage.
      // Starts at 5, degrades with poor performance. No deals = neutral 3.0.
      let rating = 3.0;
      if (totalPayments > 0) {
        rating = (onTimePayments / totalPayments) * 5;
      } else if (totalDeals > 0) {
        // Has deals but no payments yet, neutral rating.
        rating = 4.0;
      }

      await marketerDoc.ref.update({ rating: parseFloat(rating.toFixed(2)) });

      marketersProcessed++;
      details.push(`Updated rating for ${marketer.name} to ${rating.toFixed(2)}.`);
    } catch (e) {
      errors++;
      details.push(`Error processing rating for ${marketer.name}: ${e instanceof Error ? e.message : 'Unknown'}`);
      console.error(`Failed to process rating for marketer ${marketerId}:`, e);
    }
  }

  return { processed: marketersProcessed, errors, details };
}


// --- Main Cron Job Handler ---
async function handleCron(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const [zakatResult, recoveryResult, marketerResult] = await Promise.all([
            processZakat(),
            processRecoveryTasks(),
            processMarketerRatings()
        ]);
        const ownerProfitResult = await processOwnerProfitAllocations({ includeHistorical: false, limit: 500 });

        return NextResponse.json({
            success: true,
            message: 'Cron jobs executed successfully.',
            zakat: zakatResult,
            recovery: recoveryResult,
            marketerRating: marketerResult,
            ownerProfit: ownerProfitResult,
        });
    } catch (error) {
        console.error('CRON JOB FAILED:', error);
        return NextResponse.json({ success: false, message: 'Cron job failed.', error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

// Cloud Scheduler invokes POST. GET remains available for an authenticated
// manual health check without maintaining a second implementation.
export const POST = handleCron;
export const GET = handleCron;

    
