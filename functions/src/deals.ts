
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";

const createDealSchema = z.object({
  dealName: z.string().min(3),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  marketerId: z.string().optional(),
  principal: z.coerce.number().positive(),
  profitRate: z.coerce.number().min(0),
  managementFeeRate: z.coerce.number().min(0),
  financingMode: z.enum(['Murabaha', 'Ijara']).default('Murabaha'),
  durationValue: z.coerce.number().positive().int(),
  durationUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  repaymentType: z.enum(['Equal Installments', 'Balloon Payment']),
  repaymentFrequency: z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
  startDate: z.string().optional(), // Expecting ISO string from client
});


export const createDeal = onCall(async (request) => {
    // Ensure the caller is an admin
    if (!request.auth || request.auth.token.role !== 'Admin') {
        throw new HttpsError('unauthenticated', 'The function must be called by an authenticated admin.');
    }
    
    const validated = createDealSchema.safeParse(request.data);
    if (!validated.success) {
        throw new HttpsError('invalid-argument', 'Invalid data provided for deal creation.');
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
    } catch (error: any) {
        throw new HttpsError('internal', error.message || 'An unknown error occurred while creating the deal.');
    }
});
