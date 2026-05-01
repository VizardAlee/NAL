
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { z } from "zod";

const createDealSchema = z.object({
  dealName: z.string().min(3),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  marketerId: z.string().optional(),
  principal: z.coerce.number().positive(),
  profitRate: z.coerce.number().min(0),
  managementFeeRate: z.coerce.number().min(0),
  financingMode: z.enum(['Murabaha', 'Ijara', 'Mudaraba']).default('Murabaha'),
  durationValue: z.coerce.number().positive().int(),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.enum(['Equal Installments', 'Balloon Payment']),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
  startDate: z.string().optional(), // Expecting ISO string from client
});

function isAdminCaller(token: admin.auth.DecodedIdToken | undefined): boolean {
    if (!token) return false;
    return token.role === 'Admin' || token.accessRole === 'ADMIN';
}

function getErrorDetails(error: unknown) {
    if (error instanceof Error) {
        const firebaseError = error as Error & { code?: string };
        return {
            code: firebaseError.code || 'unknown',
            message: firebaseError.message,
            name: firebaseError.name,
        };
    }

    return {
        code: 'unknown',
        message: String(error),
        name: 'NonError',
    };
}

export const createDeal = onCall(
  {
    cors: [
      'https://nalgm.com',
      'https://www.nalgm.com',
      'https://studio--studio-1298078893-e7941.us-central1.hosted.app',
      /^http:\/\/localhost(:\d+)?$/,
    ],
  },
  async (request) => {
    // Ensure the caller is an admin
    if (!isAdminCaller(request.auth?.token)) {
        throw new HttpsError('unauthenticated', 'The function must be called by an authenticated admin.');
    }
    
    const validated = createDealSchema.safeParse(request.data);
    if (!validated.success) {
        logger.warn('createDeal validation failed', {
            issues: validated.error.flatten(),
            callerUid: request.auth?.uid,
        });
        throw new HttpsError(
            'invalid-argument',
            'Invalid data provided for deal creation.',
            validated.error.flatten()
        );
    }
    
    const { principal, managementFeeRate, startDate, ...restOfData } = validated.data;
    const managementFeeAmount = (principal * managementFeeRate) / 100;
    
    const dealData = {
        ...restOfData,
        principal,
        managementFeeRate,
        managementFeeAmount,
        managementFeePaid: false,
        status: 'Pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        startDate: startDate ? admin.firestore.Timestamp.fromDate(new Date(startDate)) : admin.firestore.FieldValue.serverTimestamp(),
    };
    
    try {
        const newDealRef = await admin.firestore().collection('deals').add(dealData);
        return { success: true, message: 'Deal created successfully.', dealId: newDealRef.id };
    } catch (error: unknown) {
        const details = getErrorDetails(error);
        logger.error('createDeal failed while writing deal', {
            ...details,
            callerUid: request.auth?.uid,
            clientId: validated.data.clientId,
            financingMode: validated.data.financingMode,
            principal: validated.data.principal,
        });
        throw new HttpsError(
            'internal',
            details.message || 'An unknown error occurred while creating the deal.',
            details
        );
    }
  }
);
