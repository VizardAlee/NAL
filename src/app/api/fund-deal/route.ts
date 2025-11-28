
import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, FieldValue, runTransaction } from 'firebase-admin/firestore';

const serviceAccount: ServiceAccount | undefined = process.env.FIREBASE_CLIENT_EMAIL
  ? {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }
  : undefined;

function getAdminFirestore() {
    const apps = getApps();
    if (!apps.length) {
        if (!serviceAccount?.projectId) {
            throw new Error('Firebase Admin SDK environment variables are not set.');
        }
        initializeApp({
            credential: cert(serviceAccount),
        });
    }
    return getFirestore();
}

export async function POST(request: NextRequest) {
    const { dealId } = await request.json();

    if (!dealId) {
        return NextResponse.json({ success: false, message: 'Deal ID is missing.' }, { status: 400 });
    }

    const firestore = getAdminFirestore();

    try {
        await runTransaction(firestore, async (transaction) => {
            const dealRef = firestore.collection('deals').doc(dealId);
            const dealDoc = await transaction.get(dealRef);

            if (!dealDoc.exists) {
                throw new Error('Deal not found.');
            }

            const dealData = dealDoc.data();
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
                return;
            }

            const fundBatchesQuery = firestore.collection('fundBatches')
                .where('remainingAmount', '>', 0)
                .orderBy('createdAt', 'asc');
            
            const fundBatchesSnapshot = await transaction.get(fundBatchesQuery);
            
            const totalAvailableFunds = fundBatchesSnapshot.docs.reduce((sum, doc) => sum + doc.data().remainingAmount, 0);
            
            if (totalAvailableFunds < amountToFund) {
                throw new Error(`Insufficient funds available. Need ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amountToFund)}, but only ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(totalAvailableFunds)} is available.`);
            }

            for (const batchDoc of fundBatchesSnapshot.docs) {
                if (amountToFund <= 0) break;

                const batchData = batchDoc.data();
                const amountToDeduct = Math.min(amountToFund, batchData.remainingAmount);

                const investmentRef = firestore.collection('investments').doc();
                transaction.set(investmentRef, {
                    investorId: batchData.sourceId,
                    dealId: dealId,
                    amount: amountToDeduct,
                    createdAt: FieldValue.serverTimestamp(),
                });

                const transactionRef = firestore.collection('transactions').doc();
                transaction.set(transactionRef, {
                    userId: batchData.sourceId,
                    dealId: dealId,
                    type: 'Investment',
                    amount: -amountToDeduct,
                    createdAt: FieldValue.serverTimestamp(),
                    dealName: dealData.dealName,
                });

                transaction.update(batchDoc.ref, {
                    remainingAmount: FieldValue.increment(-amountToDeduct)
                });
                
                amountToFund -= amountToDeduct;
            }

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
