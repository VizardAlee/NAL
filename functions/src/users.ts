
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
});

// Helper function to generate a unique referral code
function generateReferralCode(name: string): string {
    const namePart = name.split(' ')[0].toUpperCase().substring(0, 4).padEnd(4, 'X');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MARK-${namePart}-${randomPart}`;
}

export const createUser = onCall(async (request) => {
    // Optional: Add authentication check to ensure only admins can call this
    // if (!request.auth || request.auth.token.role !== 'Admin') {
    //     throw new HttpsError('unauthenticated', 'The function must be called by an authenticated admin.');
    // }
    
    const validated = createUserSchema.safeParse(request.data);
    if (!validated.success) {
        throw new HttpsError('invalid-argument', 'Invalid data provided.');
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

        const userData: any = { name, email, role };
        if (phoneNumber) userData.phoneNumber = phoneNumber;
        if (referralCode) userData.referredByCode = referralCode;

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
