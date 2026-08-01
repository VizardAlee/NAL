'use server';

import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { getAuthErrorStatus, verifyAuthToken } from '@/lib/server/auth';
import type {
  AccessRole,
  LegacyRole,
  Persona,
  PrimaryPortal,
} from '@/lib/access-control';

const profileRequestSchema = z.object({
  authToken: z.string().min(1),
});

export type AuthenticatedProfile = {
  uid: string;
  name: string;
  email: string;
  role?: LegacyRole;
  roles?: LegacyRole[];
  accessRole?: AccessRole;
  personas?: Persona[];
  primaryPortal?: PrimaryPortal;
  isMuslim?: boolean;
  photoURL?: string;
  address?: string;
  phoneNumber?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
};

export async function loadAuthenticatedProfileAction(input: {
  authToken: string;
}): Promise<
  | { success: true; profile: AuthenticatedProfile }
  | { success: false; message: string; status: number }
> {
  const validated = profileRequestSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Authentication token is required.', status: 401 };
  }

  try {
    const decoded = await verifyAuthToken(validated.data.authToken);
    const snapshot = await adminDb.collection('users').doc(decoded.uid).get();

    if (!snapshot.exists) {
      return {
        success: false,
        message: 'Your authentication account exists, but its user profile was not found.',
        status: 404,
      };
    }

    const data = snapshot.data() || {};
    return {
      success: true,
      profile: {
        uid: decoded.uid,
        name: String(data.name || decoded.name || ''),
        email: String(data.email || decoded.email || ''),
        ...(data.role ? { role: data.role as LegacyRole } : {}),
        ...(Array.isArray(data.roles) ? { roles: data.roles as LegacyRole[] } : {}),
        ...(data.accessRole ? { accessRole: data.accessRole as AccessRole } : {}),
        ...(Array.isArray(data.personas) ? { personas: data.personas as Persona[] } : {}),
        ...(data.primaryPortal ? { primaryPortal: data.primaryPortal as PrimaryPortal } : {}),
        ...(typeof data.isMuslim === 'boolean' ? { isMuslim: data.isMuslim } : {}),
        ...(data.photoURL ? { photoURL: String(data.photoURL) } : {}),
        ...(data.address ? { address: String(data.address) } : {}),
        ...(data.phoneNumber ? { phoneNumber: String(data.phoneNumber) } : {}),
        ...(data.bankName ? { bankName: String(data.bankName) } : {}),
        ...(data.bankAccountName ? { bankAccountName: String(data.bankAccountName) } : {}),
        ...(data.bankAccountNumber ? { bankAccountNumber: String(data.bankAccountNumber) } : {}),
      },
    };
  } catch (error) {
    const status = getAuthErrorStatus(error) || 503;
    console.warn('Unable to load authenticated user profile.', {
      status,
      message: error instanceof Error ? error.message : 'Unknown profile lookup failure',
    });
    return {
      success: false,
      message:
        status === 401
          ? 'Your sign-in session could not be verified. Please sign in again.'
          : 'You are signed in, but your profile is temporarily unavailable. Please retry.',
      status,
    };
  }
}
