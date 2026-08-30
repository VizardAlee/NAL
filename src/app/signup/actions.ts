
'use server';

import { getAdminApp } from '@/firebase/admin-app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
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
import {
  isGovernmentIdType,
  isValidBvn,
  isValidGovernmentIdNumber,
  isValidNigerianAccountNumber,
  isValidTin,
  maskIdentifier,
  normalizeDigits,
  normalizeGovernmentIdNumber,
} from '@/lib/kyc';

const signUpSchema = z.object({
  name: z.string().optional().default(''),
  accountType: z.enum(['Individual', 'Organization']),
  organizationName: z.string().optional(),
  organizationRegistrationNumber: z.string().optional(),
  organizationAddress: z.string().optional(),
  representativeName: z.string().optional(),
  representativeTitle: z.string().optional(),
  representativePhoneNumber: z.string().optional(),
  representativeIdType: z.string().optional(),
  representativeIdNumber: z.string().optional(),
  governmentIdType: z.string().optional(),
  governmentIdNumber: z.string().optional(),
  bvn: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  tin: z.string().optional(),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phoneNumber: z.string().optional(),
  inviteToken: z.string().min(20, "Invalid invite token."),
  referralCode: z.string().optional(),
}).superRefine((data, ctx) => {
  const required = (field: keyof typeof data, value: string | undefined, message: string) => {
    if (!value?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
  };
  if (data.accountType === 'Organization') {
    required('organizationName', data.organizationName, 'Organization name is required.');
    required('organizationRegistrationNumber', data.organizationRegistrationNumber, 'Registration number is required.');
    required('organizationAddress', data.organizationAddress, 'Registered address is required.');
    required('representativeName', data.representativeName, 'Representative name is required.');
    required('representativeTitle', data.representativeTitle, 'Representative capacity is required.');
    required('representativePhoneNumber', data.representativePhoneNumber, 'Representative phone number is required.');
    required('representativeIdType', data.representativeIdType, 'Identity document type is required.');
    required('representativeIdNumber', data.representativeIdNumber, 'Identity document number is required.');
  } else {
    required('name', data.name, 'Full name is required.');
  }
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

    const { name, email, password, inviteToken, phoneNumber, referralCode, accountType,
      organizationName, organizationRegistrationNumber, organizationAddress,
      representativeName, representativeTitle, representativePhoneNumber,
      representativeIdType, representativeIdNumber, governmentIdType, governmentIdNumber,
      bvn, bankName, bankAccountName, bankAccountNumber, tin } = validated.data;
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
            isMuslim?: boolean;
            accountType?: 'Individual' | 'Organization';
            status: 'Pending' | 'Used';
        };
        if (!inviteData || inviteData.status !== 'Pending') {
            return { success: false, message: "This invite link has already been used or is invalid." };
        }

        if (inviteData.email.toLowerCase() !== email.toLowerCase()) {
            return { success: false, message: "This invite link is for a different email address." };
        }
        const invitedAccountType = inviteData.accountType || 'Individual';
        if (accountType !== invitedAccountType) {
            return { success: false, message: 'The account type does not match this invitation.' };
        }
        const legalName = accountType === 'Organization' ? organizationName!.trim() : name.trim();

        const accessModel = normalizeAccessModel({
            role: inviteData.role as any,
            accessRole: inviteData.accessRole,
            personas: inviteData.personas,
            primaryPortal: inviteData.primaryPortal,
        });
        const role = toLegacyRoleFromAccess(accessModel);
        const isInvestor = accessModel.personas.includes('INVESTOR');
        const requiresKyc = isInvestor || accessModel.personas.includes('CLIENT');
        if (isInvestor && typeof inviteData.isMuslim !== 'boolean') {
            return {
                success: false,
                message: 'This investor invite is missing the Muslim/non-Muslim classification. Ask an administrator to regenerate it.',
            };
        }

        const suppliedGovernmentIdType = accountType === 'Organization'
            ? representativeIdType?.trim() || ''
            : governmentIdType?.trim() || '';
        const suppliedGovernmentIdNumber = accountType === 'Organization'
            ? representativeIdNumber?.trim() || ''
            : governmentIdNumber?.trim() || '';
        if (requiresKyc) {
            if (!isGovernmentIdType(suppliedGovernmentIdType)
                || !isValidGovernmentIdNumber(suppliedGovernmentIdType, suppliedGovernmentIdNumber)) {
                return { success: false, message: 'Enter a valid supported government-issued identity number.' };
            }
            if (!bvn || !isValidBvn(bvn)) {
                return { success: false, message: 'BVN must contain exactly 11 digits.' };
            }
            if (!bankName?.trim() || bankName.trim().length < 2
                || !bankAccountName?.trim() || bankAccountName.trim().length < 2
                || !bankAccountNumber || !isValidNigerianAccountNumber(bankAccountNumber)) {
                return { success: false, message: 'Enter complete bank details and a valid 10-digit account number.' };
            }
            if (isInvestor && (!tin || !isValidTin(tin))) {
                return { success: false, message: 'Investor TIN must contain between 8 and 14 digits.' };
            }
        }

        const userExists = await auth.getUserByEmail(email).catch(() => null);
        if (userExists) {
            return { success: false, message: "An account with this email already exists." };
        }

        // 1. Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: legalName,
            emailVerified: true,
        });

        // 2. Set Custom Claim for Security Rules
        await auth.setCustomUserClaims(userRecord.uid, {
            role,
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
            primaryPortal: accessModel.primaryPortal,
            ...(isInvestor ? { isMuslim: inviteData.isMuslim } : {}),
        });

        // 3. Create user document in Firestore with the selected role
        const userData: any = {
            name: legalName,
            email,
            accountType,
            role,
            accessRole: accessModel.accessRole,
            personas: accessModel.personas,
            primaryPortal: accessModel.primaryPortal,
        };
        if (requiresKyc) {
            const normalizedGovernmentId = normalizeGovernmentIdNumber(suppliedGovernmentIdNumber);
            const normalizedBvn = normalizeDigits(bvn!);
            Object.assign(userData, {
                bankName: bankName!.trim(),
                bankAccountName: bankAccountName!.trim(),
                bankAccountNumber: normalizeDigits(bankAccountNumber!),
                kycStatus: 'SUBMITTED',
                governmentIdType: suppliedGovernmentIdType,
                governmentIdLast4: normalizedGovernmentId.slice(-4),
                bvnLast4: normalizedBvn.slice(-4),
                ...(isInvestor ? { tinLast4: normalizeDigits(tin!).slice(-4) } : {}),
            });
        }
        if (accountType === 'Organization') {
            Object.assign(userData, {
                organizationName: legalName,
                organizationRegistrationNumber: organizationRegistrationNumber!.trim(),
                organizationAddress: organizationAddress!.trim(),
                representativeName: representativeName!.trim(),
                representativeTitle: representativeTitle!.trim(),
                representativePhoneNumber: representativePhoneNumber!.trim(),
                representativeEmail: email,
                representativeIdType: suppliedGovernmentIdType,
                representativeIdNumber: maskIdentifier(normalizeGovernmentIdNumber(suppliedGovernmentIdNumber)),
                address: organizationAddress!.trim(),
                phoneNumber: representativePhoneNumber!.trim(),
            });
        } else if (phoneNumber) {
            userData.phoneNumber = phoneNumber.trim();
        }
        if (referralCode) {
            userData.referredByCode = referralCode;
        }
        
        // 4. Generate and add referral code if the user is a Marketer
        if (role === 'Marketer') {
            userData.referralCode = generateReferralCode(legalName);
            userData.rating = 0; // Initialize rating
        }


        const batch = adminDb.batch();
        batch.set(adminDb.collection('users').doc(userRecord.uid), userData);
        if (requiresKyc) {
            batch.set(adminDb.collection('userKycProfiles').doc(userRecord.uid), {
                userId: userRecord.uid,
                accountType,
                governmentIdType: suppliedGovernmentIdType,
                governmentIdNumber: normalizeGovernmentIdNumber(suppliedGovernmentIdNumber),
                bvn: normalizeDigits(bvn!),
                bankName: bankName!.trim(),
                bankAccountName: bankAccountName!.trim(),
                bankAccountNumber: normalizeDigits(bankAccountNumber!),
                ...(isInvestor ? { tin: normalizeDigits(tin!) } : {}),
                status: 'SUBMITTED',
                submittedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
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
    isMuslim?: boolean;
    accountType?: 'Individual' | 'Organization';
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
            isMuslim?: boolean;
            accountType?: 'Individual' | 'Organization';
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
            isMuslim: inviteData.isMuslim,
            accountType: inviteData.accountType || 'Individual',
        };
    } catch (error: any) {
        return { valid: false, message: error.message || 'Failed to validate invite link.' };
    }
}
