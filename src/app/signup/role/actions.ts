
'use server';

import { adminDb, getAdminApp } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const setRoleSchema = z.object({
    role: z.enum(['Investor', 'Client']),
    userId: z.string().min(1, 'User ID is required.'),
});

type ActionResponse = {
    success: boolean;
    message: string;
    redirectUrl?: string;
};

export async function setRoleAction(
    prevState: any,
    formData: FormData
): Promise<ActionResponse> {
    const validated = setRoleSchema.safeParse({
        role: formData.get('role'),
        userId: formData.get('userId'),
    });

    if (!validated.success) {
        return { success: false, message: 'Invalid data provided. Please try again.' };
    }

    const { role, userId } = validated.data;
    const auth = getAuth(getAdminApp());

    try {
        // 1. Set Custom Claim for Security Rules
        await auth.setCustomUserClaims(userId, { role });

        // 2. Update Firestore Document
        const userDocRef = adminDb.collection('users').doc(userId);
        await userDocRef.update({ role });

        // Revalidate paths that show user data
        revalidatePath('/admin/users');

        let redirectUrl = '/';
        if (role === 'Investor') {
            redirectUrl = '/investor/dashboard';
        } else if (role === 'Client') {
            redirectUrl = '/client/dashboard';
        }

        return {
            success: true,
            message: `Profile complete! You are now registered as a ${role}.`,
            redirectUrl: redirectUrl
        };

    } catch (error: any) {
        console.error("Set Role Error:", error);
        return { success: false, message: error.message || "An unknown error occurred while setting your role." };
    }
}
