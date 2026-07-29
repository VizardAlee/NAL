
'use server';

import { adminDb, getAdminApp } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { normalizeAccessModel } from '@/lib/access-control';
import { verifyAuthTokenForUser } from '@/lib/server/auth';

const setRoleSchema = z
    .object({
        role: z.enum(['Investor', 'Client']),
        userId: z.string().min(1, 'User ID is required.'),
        isMuslim: z.enum(['true', 'false']).optional(),
    })
    .superRefine((data, ctx) => {
        if (data.role === 'Investor' && !data.isMuslim) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['isMuslim'],
                message: 'Select Muslim or non-Muslim.',
            });
        }
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
        isMuslim: formData.get('isMuslim') || undefined,
    });

    if (!validated.success) {
        return { success: false, message: 'Invalid data provided. Please try again.' };
    }

    const { role, userId, isMuslim } = validated.data;
    await verifyAuthTokenForUser(String(formData.get('authToken') || ''), userId);
    const auth = getAuth(getAdminApp());
    const accessModel = normalizeAccessModel({ role });

    try {
        // 1. Set Custom Claim for Security Rules
        await auth.setCustomUserClaims(userId, {
            role,
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
        });

        // 2. Update Firestore Document
        const userDocRef = adminDb.collection('users').doc(userId);
        const profileUpdate: Record<string, unknown> = {
            role,
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
            primaryPortal: accessModel.primaryPortal,
        };
        if (role === 'Investor') {
            profileUpdate.isMuslim = isMuslim === 'true';
        }
        await userDocRef.update(profileUpdate);

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
