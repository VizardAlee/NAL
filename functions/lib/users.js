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
exports.createUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const zod_1 = require("zod");
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    phoneNumber: zod_1.z.string().optional(),
    role: zod_1.z.enum(['Investor', 'Client', 'Marketer', 'Admin', 'Legal', 'Recovery']),
    referralCode: zod_1.z.string().optional(),
});
// Helper function to generate a unique referral code
function generateReferralCode(name) {
    const namePart = name.split(' ')[0].toUpperCase().substring(0, 4).padEnd(4, 'X');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MARK-${namePart}-${randomPart}`;
}
exports.createUser = (0, https_1.onCall)(async (request) => {
    // Optional: Add authentication check to ensure only admins can call this
    // if (!request.auth || request.auth.token.role !== 'Admin') {
    //     throw new HttpsError('unauthenticated', 'The function must be called by an authenticated admin.');
    // }
    const validated = createUserSchema.safeParse(request.data);
    if (!validated.success) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid data provided.');
    }
    const { name, email, password, role, phoneNumber, referralCode } = validated.data;
    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
            emailVerified: true,
        });
        await admin.auth().setCustomUserClaims(userRecord.uid, { role });
        const userData = { name, email, role };
        if (phoneNumber)
            userData.phoneNumber = phoneNumber;
        if (referralCode)
            userData.referredByCode = referralCode;
        if (role === 'Marketer') {
            userData.referralCode = generateReferralCode(name);
            userData.rating = 0;
        }
        await admin.firestore().collection('users').doc(userRecord.uid).set(userData);
        return { success: true, message: `User ${name} created successfully as ${role}.`, uid: userRecord.uid };
    }
    catch (error) {
        if (error.code === 'auth/email-already-exists') {
            throw new https_1.HttpsError('already-exists', 'This email address is already in use.');
        }
        throw new https_1.HttpsError('internal', error.message || 'An unknown error occurred.');
    }
});
//# sourceMappingURL=users.js.map