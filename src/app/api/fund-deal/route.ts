
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { differenceInDays } from 'date-fns';
import { getAuthErrorStatus, verifyAdminWrite } from '@/lib/server/auth';
import { getAdminApp } from '@/firebase/admin-app';
import { hasCompleteGuarantor } from '@/lib/deals/guarantor';

// Defines the shape of the data for a Deal document
interface Deal {
    principal: number;
    status: string;
    dealName: string;
    durationValue: number;
    durationUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
    createdAt: admin.firestore.Timestamp;
    startDate?: admin.firestore.Timestamp;
    guarantorName?: string;
    guarantorAddress?: string;
    guarantorPhoneNumber?: string;
    guarantorOccupation?: string;
    guarantorPhotoURL?: string;
}

// Defines the shape of the data for a FundBatch document
interface FundBatch {
    remainingAmount: number;
    sourceId: string;
    tenureValue: number;
    tenureUnit: 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';
    createdAt: admin.firestore.Timestamp;
    specialInvestment?: boolean;
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

const TWELVE_MONTHS_IN_DAYS = 12 * DURATION_IN_DAYS.Months;

export async function POST(request: NextRequest) {
    const { dealId } = await request.json();
    const authHeader = request.headers.get('authorization');
    const authToken = authHeader?.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';

    if (!dealId) {
        return NextResponse.json({ success: false, message: 'Deal ID is missing.' }, { status: 400 });
    }

    const app = getAdminApp();
    const firestore = admin.firestore(app);
    let finalAmountFunded = 0;

    try {
        await verifyAdminWrite(authToken);

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

            if (!hasCompleteGuarantor(dealData)) {
                throw new Error('This deal cannot be funded until the required guarantor details and photograph are complete.');
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
                const isShortTermBatch = originalBatchTenureInDays <= TWELVE_MONTHS_IN_DAYS;

                if (isShortTermBatch) {
                    const isShortTermDeal = dealDurationInDays <= TWELVE_MONTHS_IN_DAYS;
                    return isShortTermDeal;
                } else {
                    const expiryDate = batchData.createdAt.toDate();
                    expiryDate.setDate(expiryDate.getDate() + originalBatchTenureInDays);
                    const remainingTenureInDays = differenceInDays(expiryDate, today);
                    return remainingTenureInDays >= (dealDurationInDays - 5);
                }
            }).sort((a, b) => {
                const aData = a.data() as FundBatch;
                const bData = b.data() as FundBatch;
                const specialDelta = Number(Boolean(bData.specialInvestment)) - Number(Boolean(aData.specialInvestment));
                if (specialDelta !== 0) return specialDelta;
                return aData.createdAt.toMillis() - bData.createdAt.toMillis();
            });
            
            // Do not throw error for insufficient funds, just use what's available
            const totalAvailableFunds = eligibleBatches.reduce((sum, doc) => sum + (doc.data() as FundBatch).remainingAmount, 0);
            if (totalAvailableFunds === 0) {
                throw new Error("No eligible funds available to fund this deal.");
            }

            for (const batchDoc of eligibleBatches) {
                if (amountToFund <= 0) break;

                const batchData = batchDoc.data() as FundBatch;
                const amountToDeduct = Math.min(amountToFund, batchData.remainingAmount);

                finalAmountFunded += amountToDeduct;

                // Determine the correct historical timestamp for the transaction.
                const dealStartDate = dealData.startDate || dealData.createdAt;
                const batchTimestamp = batchData.createdAt;
                const transactionTimestamp = dealStartDate.toMillis() > batchTimestamp.toMillis() ? dealStartDate : batchTimestamp;

                // Create an Investment document
                const investmentRef = firestore.collection('investments').doc();
                transaction.set(investmentRef, {
                    investorId: batchData.sourceId,
                    dealId: dealId,
                    fundBatchId: batchDoc.id,
                    amount: amountToDeduct,
                    createdAt: transactionTimestamp,
                    specialInvestment: Boolean(batchData.specialInvestment),
                });

                // Create a corresponding 'Investment' transaction
                const transactionRef = firestore.collection('transactions').doc();
                transaction.set(transactionRef, {
                    userId: batchData.sourceId,
                    dealId: dealId,
                    fundBatchId: batchDoc.id,
                    investmentId: investmentRef.id,
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

        const dealDocAfter = await firestore.collection('deals').doc(dealId).get();
        const dealDataAfter = dealDocAfter.data();
        
        if (dealDataAfter?.status === 'Active') {
            return NextResponse.json({ success: true, message: 'Deal has been fully funded and is now Active.' }, { status: 200 });
        } else {
             return NextResponse.json({ success: true, message: `Successfully funded deal with ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(finalAmountFunded)}. Deal is now partially funded.` }, { status: 200 });
        }

    } catch (error: any) {
        const authStatus = getAuthErrorStatus(error);
        if (authStatus) {
            return NextResponse.json({ success: false, message: error.message }, { status: authStatus });
        }
        console.error('DEAL FUNDING FAILED:', error);
        return NextResponse.json({ success: false, message: error.message || 'An unknown error occurred during funding.' }, { status: 500 });
    }
}
