"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeal = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const zod_1 = require("zod");
const createDealSchema = zod_1.z.object({
    dealName: zod_1.z.string().min(3),
    clientId: zod_1.z.string().min(1),
    clientName: zod_1.z.string().min(1),
    marketerId: zod_1.z.string().optional(),
    principal: zod_1.z.coerce.number().positive(),
    profitRate: zod_1.z.coerce.number().min(0),
    managementFeeRate: zod_1.z.coerce.number().min(0),
    financingMode: zod_1.z.enum(['Murabaha', 'Ijara']).default('Murabaha'),
    durationValue: zod_1.z.coerce.number().positive().int(),
    durationUnit: zod_1.z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
    repaymentType: zod_1.z.enum(['Equal Installments', 'Balloon Payment']),
    repaymentFrequency: zod_1.z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']),
    startDate: zod_1.z.string().optional(), // Expecting ISO string from client
});
exports.createDeal = (0, https_1.onCall)(async (request) => {
    // Ensure the caller is an admin
    if (!request.auth || request.auth.token.role !== 'Admin') {
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