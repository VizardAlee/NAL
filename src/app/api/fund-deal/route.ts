
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import { differenceInDays } from 'date-fns';

// Defines the shape of the data for a Deal document
interface Deal {
    principal: number;
    status: string;
    dealName: string;
    durationValue: number;
    durationUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
    createdAt: admin.firestore.Timestamp;
}

// Defines the shape of the data for a FundBatch document
interface FundBatch {
    remainingAmount: number;
    sourceId: string;
    tenureValue: number;
    tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
    createdAt: admin.firestore.Timestamp;
}

const DURATION_IN_DAYS = {
    Days: 1,
    Weeks: 7,
    Fortnights: 14,
    Months: 30.4375, // Average days in month
    Years: 365.25,
};

function convertToDays(value: number, unit: keyof typeof DURATION_IN_DAYS): number {
    return value * (DURATION_IN_DAYS[unit] || 0);
}

const EIGHTEEN_MONTHS_IN_DAYS = 18 * DURATION_IN_DAYS.Months;

const serviceAccount: ServiceAccount | undefined = process.env.FIREBASE_CLIENT_EMAIL
  ? {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }
  : undefined;

function getAdminApp() {
    const apps = admin.apps;
    if (!apps.length) {
        if (!serviceAccount?.projectId) {
            throw new Error('Firebase Admin SDK environment variables are not set.');
        }
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }
    return apps[0]!;
}

export async function POST(request: NextRequest) {
    const { dealId } = await request.json();

    if (!dealId) {
        return NextResponse.json({ success: false, message: 'Deal ID is missing.' }, { status: 400 });
    }

    const app = getAdminApp();
    const firestore = admin.firestore(app);

    try {
        await firestore.runTransaction(async (transaction) => {
            const dealRef = firestore.collection('deals').doc(dealId);
            const dealDoc = await transaction.get(dealRef);

            if (!dealDoc.exists) {
                throw new Error('Deal not found.');
            }

            const dealData = dealDoc.data() as Deal;
            if (!dealData) {
                throw new Error('Deal data is invalid.');
            }

            if (dealData.status !== 'Pending') {
                throw new Error(`Deal is already ${dealData.status}.`);
            }
            
            const investmentsSnapshot = await transaction.get(
                firestore.collection('investments').where('dealId', '==', dealId)
            );
            const totalFunded = investmentsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            
            let amountToFund = dealData.principal - totalFunded;

            if (amountToFund <= 0) {
                transaction.update(dealRef, { status: 'Active' });
                return; // Exit transaction early if already funded
            }
            
            const dealDurationInDays = convertToDays(dealData.durationValue, dealData.durationUnit);
            const today = new Date();

            const fundBatchesQuery = firestore.collection('fundBatches')
                .where('remainingAmount', '>', 0)
                .orderBy('createdAt', 'asc');
            
            const fundBatchesSnapshot = await transaction.get(fundBatchesQuery);
            
            const eligibleBatches = fundBatchesSnapshot.docs.filter(doc => {
                const batchData = doc.data() as FundBatch;
                const originalBatchTenureInDays = convertToDays(batchData.tenureValue, batchData.tenureUnit);
                const isShortTermBatch = originalBatchTenureInDays < EIGHTEEN_MONTHS_IN_DAYS;

                if (isShortTermBatch) {
                    const isShortTermDeal = dealDurationInDays < EIGHTEEN_MONTHS_IN_DAYS;
                    return isShortTermDeal;
                } else {
                    const expiryDate = batchData.createdAt.toDate();
                    expiryDate.setDate(expiryDate.getDate() + originalBatchTenureInDays);
                    const remainingTenureInDays = differenceInDays(expiryDate, today);
                    return remainingTenureInDays >= (dealDurationInDays - 5);
                }
            });

            const totalAvailableFunds = eligibleBatches.reduce((sum, doc) => sum + (doc.data() as FundBatch).remainingAmount, 0);
            
            if (totalAvailableFunds < amountToFund) {
                throw new Error(`Insufficient funds available. Need ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amountToFund)}, but only ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(totalAvailableFunds)} is available in eligible batches.`);
            }

            for (const batchDoc of eligibleBatches) {
                if (amountToFund <= 0) break;

                const batchData = batchDoc.data() as FundBatch;
                const amountToDeduct = Math.min(amountToFund, batchData.remainingAmount);

                // Determine the correct historical timestamp for the transaction
                const dealTimestamp = dealData.createdAt;
                const batchTimestamp = batchData.createdAt;
                const transactionTimestamp = dealTimestamp.toMillis() > batchTimestamp.toMillis() ? dealTimestamp : batchTimestamp;

                // Create an Investment document
                const investmentRef = firestore.collection('investments').doc();
                transaction.set(investmentRef, {
                    investorId: batchData.sourceId,
                    dealId: dealId,
                    amount: amountToDeduct,
                    createdAt: transactionTimestamp,
                });

                // Create a corresponding 'Investment' transaction
                const transactionRef = firestore.collection('transactions').doc();
                transaction.set(transactionRef, {
                    userId: batchData.sourceId,
                    dealId: dealId,
                    type: 'Investment',
                    amount: -amountToDeduct,
                    createdAt: transactionTimestamp,
                    dealName: dealData.dealName,
                });
                
                // Decrement the remaining amount in the fund batch
                transaction.update(batchDoc.ref, {
                    remainingAmount: admin.firestore.FieldValue.increment(-amountToDeduct)
                });
                
                amountToFund -= amountToDeduct;
            }

            // If fully funded, update the deal status to 'Active'
            if (amountToFund <= 0) {
                transaction.update(dealRef, { status: 'Active' });
            }
        });

        return NextResponse.json({ success: true, message: 'Deal has been successfully funded and is now Active.' }, { status: 200 });

    } catch (error: any) {
        console.error('DEAL FUNDING FAILED:', error);
        return NextResponse.json({ success: false, message: error.message || 'An unknown error occurred during funding.' }, { status: 500 });
    }
}
