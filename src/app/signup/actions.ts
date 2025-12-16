
'use server';

import { adminDb } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phoneNumber: z.string().optional(),
  role: z.enum(['Investor', 'Client'], { required_error: 'Role is required.' }),
  referralCode: z.string().optional(),
});

type ActionResponse = {
    success: boolean;
    message: string;
    redirectUrl?: string;
};

export async function signUpWithEmailAction(
    data: z.infer<typeof signUpSchema>
): Promise<ActionResponse> {
    const validated = signUpSchema.safeParse(data);

    if (!validated.success) {
        return { success: false, message: 'Invalid form data provided.' };
    }

    const { name, email, password, role, phoneNumber, referralCode } = validated.data;
    const auth = getAuth(adminDb.app);

    try {
        const userExists = await auth.getUserByEmail(email).catch(() => null);
        if (userExists) {
            return { success: false, message: "An account with this email already exists." };
        }

        // 1. Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: name,
            emailVerified: true,
        });

        // 2. Set Custom Claim for Security Rules
        await auth.setCustomUserClaims(userRecord.uid, { role });

        // 3. Create user document in Firestore with the selected role
        const userData: any = {
            name,
            email,
            role,
        };
        if (phoneNumber) {
            userData.phoneNumber = phoneNumber;
        }
        if (referralCode) {
            userData.referredByCode = referralCode;
        }

        await adminDb.collection('users').doc(userRecord.uid).set(userData);

        revalidatePath('/admin/users');
        
        let redirectUrl = '/';
        if (role === 'Investor') {
            redirectUrl = '/investor/dashboard';
        } else if (role === 'Client') {
            redirectUrl = '/client/dashboard';
        }

        return {
            success: true,
            message: `Account created successfully! You are now registered as a ${role}.`,
            redirectUrl: redirectUrl
        };

    } catch (error: any) {
        console.error("Sign up error:", error);
        return { success: false, message: error.message || "An unknown error occurred." };
    }
}
