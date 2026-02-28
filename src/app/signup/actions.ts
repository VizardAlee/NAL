
'use server';

import { getAdminApp } from '@/firebase/admin-app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
  type AccessRole,
  type Persona,
  type PrimaryPortal,
  normalizeAccessModel,
  toLegacyRoleFromAccess,
} from '@/lib/access-control';

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phoneNumber: z.string().optional(),
  inviteToken: z.string().min(20, "Invalid invite token."),
  referralCode: z.string().optional(),
});

type ActionResponse = {
    success: boolean;
    message: string;
    redirectUrl?: string;
};

// Helper function to generate a unique referral code
function generateReferralCode(name: string): string {
    const namePart = name.split(' ')[0].toUpperCase().substring(0, 4).padEnd(4, 'X');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MARK-${namePart}-${randomPart}`;
}

export async function signUpWithEmailAction(
    data: z.infer<typeof signUpSchema>
): Promise<ActionResponse> {
    const validated = signUpSchema.safeParse(data);

    if (!validated.success) {
        return { success: false, message: 'Invalid form data provided.' };
    }

    const { name, email, password, inviteToken, phoneNumber, referralCode } = validated.data;
    const app = getAdminApp();
    const auth = getAuth(app);
    const adminDb = getFirestore(app);

    try {
        const inviteRef = adminDb.collection('invites').doc(inviteToken);
        const inviteSnap = await inviteRef.get();
        if (!inviteSnap.exists) {
            return { success: false, message: "This invite link is invalid." };
        }

        const inviteData = inviteSnap.data() as {
            email: string;
            role?: string;
            accessRole?: AccessRole;
            personas?: Persona[];
            primaryPortal?: PrimaryPortal;
            status: 'Pending' | 'Used';
        };
        if (!inviteData || inviteData.status !== 'Pending') {
            return { success: false, message: "This invite link has already been used or is invalid." };
        }

        if (inviteData.email.toLowerCase() !== email.toLowerCase()) {
            return { success: false, message: "This invite link is for a different email address." };
        }

        const accessModel = normalizeAccessModel({
            role: inviteData.role as any,
            accessRole: inviteData.accessRole,
            personas: inviteData.personas,
            primaryPortal: inviteData.primaryPortal,
        });
        const role = toLegacyRoleFromAccess(accessModel);

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
        await auth.setCustomUserClaims(userRecord.uid, {
            role,
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
            primaryPortal: accessModel.primaryPortal,
        });

        // 3. Create user document in Firestore with the selected role
        const userData: any = {
            name,
            email,
            role,
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
            primaryPortal: accessModel.primaryPortal,
        };
        if (phoneNumber) {
            userData.phoneNumber = phoneNumber;
        }
        if (referralCode) {
            userData.referredByCode = referralCode;
        }
        
        // 4. Generate and add referral code if the user is a Marketer
        if (role === 'Marketer') {
            userData.referralCode = generateReferralCode(name);
            userData.rating = 0; // Initialize rating
        }


        const batch = adminDb.batch();
        batch.set(adminDb.collection('users').doc(userRecord.uid), userData);
        batch.update(inviteRef, {
            status: 'Used',
            usedBy: userRecord.uid,
            usedAt: new Date(),
        });
        await batch.commit();

        revalidatePath('/admin/users');
        
        // Don't auto-redirect, force them to log in.
        return {
            success: true,
            message: `Account created successfully! You can now log in.`,
            redirectUrl: '/login'
        };

    } catch (error: any) {
        console.error("Sign up error:", error);
        return { success: false, message: error.message || "An unknown error occurred." };
    }
}

export async function getInviteDetailsAction(inviteToken: string): Promise<{
    valid: boolean;
    email?: string;
    role?: string;
    accessRole?: AccessRole;
    personas?: Persona[];
    primaryPortal?: PrimaryPortal;
    message?: string;
}> {
    if (!inviteToken) return { valid: false, message: 'Missing invite token.' };

    try {
        const app = getAdminApp();
        const adminDb = getFirestore(app);
        const inviteSnap = await adminDb.collection('invites').doc(inviteToken).get();

        if (!inviteSnap.exists) {
            return { valid: false, message: 'This invite link is invalid.' };
        }

        const inviteData = inviteSnap.data() as {
            email: string;
            role?: string;
            accessRole?: AccessRole;
            personas?: Persona[];
            primaryPortal?: PrimaryPortal;
            status: 'Pending' | 'Used';
        };
        if (!inviteData || inviteData.status !== 'Pending') {
            return { valid: false, message: 'This invite link has already been used or is invalid.' };
        }

        const accessModel = normalizeAccessModel({
            role: inviteData.role as any,
            accessRole: inviteData.accessRole,
            personas: inviteData.personas,
            primaryPortal: inviteData.primaryPortal,
        });
        return {
            valid: true,
            email: inviteData.email,
            role: toLegacyRoleFromAccess(accessModel),
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
            primaryPortal: accessModel.primaryPortal,
        };
    } catch (error: any) {
        return { valid: false, message: error.message || 'Failed to validate invite link.' };
    }
}
