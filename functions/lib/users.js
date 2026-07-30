"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const zod_1 = require("zod");
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    phoneNumber: zod_1.z.string().optional(),
    role: zod_1.z.enum(['Investor', 'Client', 'Marketer', 'Admin', 'Legal', 'Recovery']),
    referralCode: zod_1.z.string().optional(),
    isMuslim: zod_1.z.boolean().optional(),
}).superRefine((data, ctx) => {
    if (data.role === 'Investor' && typeof data.isMuslim !== 'boolean') {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['isMuslim'],
            message: 'Investor religious classification is required.',
        });
    }
});
function deriveAccessModel(role) {
    switch (role) {
        case 'Admin':
            return { accessRole: 'ADMIN', personas: [], primaryPortal: 'admin' };
        case 'Investor':
            return { accessRole: 'USER', personas: ['INVESTOR'], primaryPortal: 'investor' };
        case 'Client':
            return { accessRole: 'USER', personas: ['CLIENT'], primaryPortal: 'client' };
        case 'Legal':
            return { accessRole: 'USER', personas: ['LEGAL'], primaryPortal: 'legal' };
        case 'Recovery':
            return { accessRole: 'USER', personas: ['RECOVERY'], primaryPortal: 'recovery' };
        case 'Marketer':
            return { accessRole: 'USER', personas: ['MARKETER'], primaryPortal: 'marketer' };
    }
}
function isAdminCaller(token) {
    if (!token)
        return false;
    return token.accessRole === 'ADMIN' || (token.role === 'Admin' && !token.accessRole);
}
// Helper function to generate a unique referral code
function generateReferralCode(name) {
    const namePart = name.split(' ')[0].toUpperCase().substring(0, 4).padEnd(4, 'X');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MARK-${namePart}-${randomPart}`;
}
exports.createUser = (0, https_1.onCall)(async (request) => {
    if (!isAdminCaller(request.auth?.token)) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called by an authenticated admin.');
    }
    const validated = createUserSchema.safeParse(request.data);
    if (!validated.success) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid data provided.');
    }
    const { name, email, password, role, phoneNumber, referralCode, isMuslim } = validated.data;
    const accessModel = deriveAccessModel(role);
    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
            emailVerified: true,
        });
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            role,
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
        });
        const userData = { name, email, role, ...accessModel };
        if (phoneNumber)
            userData.phoneNumber = phoneNumber;
        if (referralCode)
            userData.referredByCode = referralCode;
        if (role === 'Investor')
            userData.isMuslim = isMuslim;
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