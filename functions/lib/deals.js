"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeal = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const zod_1 = require("zod");
const createDealSchema = zod_1.z.object({
    dealName: zod_1.z.string().min(3),
    clientId: zod_1.z.string().min(1),
    clientName: zod_1.z.string().min(1),
    marketerId: zod_1.z.string().optional(),
    principal: zod_1.z.coerce.number().positive(),
    profitRate: zod_1.z.coerce.number().min(0),
    managementFeeRate: zod_1.z.coerce.number().min(0),
    financingMode: zod_1.z.enum(['Murabaha', 'Ijara', 'Mudaraba']).default('Murabaha'),
    durationValue: zod_1.z.coerce.number().positive().int(),
    durationUnit: zod_1.z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
    repaymentType: zod_1.z.enum(['Equal Installments', 'Balloon Payment']),
    repaymentFrequency: zod_1.z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
    startDate: zod_1.z.string().optional(), // Expecting ISO string from client
});
function isAdminCaller(token) {
    if (!token)
        return false;
    return token.role === 'Admin' || token.accessRole === 'ADMIN';
}
exports.createDeal = (0, https_1.onCall)({
    cors: [
        'https://nalgm.com',
        'https://www.nalgm.com',
        'https://studio--studio-1298078893-e7941.us-central1.hosted.app',
        /^http:\/\/localhost(:\d+)?$/,
    ],
}, async (request) => {
    // Ensure the caller is an admin
    if (!isAdminCaller(request.auth?.token)) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called by an authenticated admin.');
    }
    const validated = createDealSchema.safeParse(request.data);
    if (!validated.success) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid data provided for deal creation.');
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
    }
    catch (error) {
        throw new https_1.HttpsError('internal', error.message || 'An unknown error occurred while creating the deal.');
    }
});
//# sourceMappingURL=deals.js.map