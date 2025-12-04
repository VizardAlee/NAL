
'use server';

import { adminDb } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type ActionResponse = {
    success: boolean;
    message: string;
    redirectUrl?: string;
};

export async function signUpWithEmailAction(
    prevState: any,
    formData: FormData
): Promise<ActionResponse> {
    const validated = signUpSchema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
    });

    if (!validated.success) {
        return { success: false, message: 'Invalid form data provided.' };
    }

    const { name, email, password } = validated.data;
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

        // 2. Create user document in Firestore (without a role)
        await adminDb.collection('users').doc(userRecord.uid).set({
            name,
            email,
            role: null, // Role will be set in the next step
        });

        revalidatePath('/admin/users');

        return {
            success: true,
            message: "Account created successfully! Let's set up your profile.",
            redirectUrl: '/signup/role'
        };

    } catch (error: any) {
        console.error("Sign up error:", error);
        return { success: false, message: error.message || "An unknown error occurred." };
    }
}
