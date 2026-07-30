
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { z } from "zod";

const createUserSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    phoneNumber: z.string().optional(),
    role: z.enum(['Investor', 'Client', 'Marketer', 'Admin', 'Legal', 'Recovery']),
    referralCode: z.string().optional(),
    isMuslim: z.boolean().optional(),
}).superRefine((data, ctx) => {
    if (data.role === 'Investor' && typeof data.isMuslim !== 'boolean') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['isMuslim'],
            message: 'Investor religious classification is required.',
        });
    }
});

function deriveAccessModel(role: z.infer<typeof createUserSchema>['role']) {
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

function isAdminCaller(token: admin.auth.DecodedIdToken | undefined): boolean {
    if (!token) return false;
    return token.accessRole === 'ADMIN' || (token.role === 'Admin' && !token.accessRole);
}

// Helper function to generate a unique referral code
function generateReferralCode(name: string): string {
    const namePart = name.split(' ')[0].toUpperCase().substring(0, 4).padEnd(4, 'X');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MARK-${namePart}-${randomPart}`;
}

export const createUser = onCall(async (request) => {
    if (!isAdminCaller(request.auth?.token)) {
        throw new HttpsError('unauthenticated', 'The function must be called by an authenticated admin.');
    }
    
    const validated = createUserSchema.safeParse(request.data);
    if (!validated.success) {
        throw new HttpsError('invalid-argument', 'Invalid data provided.');
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

        const userData: any = { name, email, role, ...accessModel };
        if (phoneNumber) userData.phoneNumber = phoneNumber;
        if (referralCode) userData.referredByCode = referralCode;
        if (role === 'Investor') userData.isMuslim = isMuslim;

        if (role === 'Marketer') {
            userData.referralCode = generateReferralCode(name);
            userData.rating = 0;
        }

        await admin.firestore().collection('users').doc(userRecord.uid).set(userData);

        return { success: true, message: `User ${name} created successfully as ${role}.`, uid: userRecord.uid };
    } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
            throw new HttpsError('already-exists', 'This email address is already in use.');
        }
        throw new HttpsError('internal', error.message || 'An unknown error occurred.');
    }
});
