import { DecodedIdToken } from 'firebase-admin/auth';
import { initializeFirebase } from '@/firebase/server';
import {
  AccessRole,
  LegacyRole,
  Persona,
  PrimaryPortal,
  canViewAdmin,
  canWriteAdmin,
  hasPersona,
} from '@/lib/access-control';

type AuthError = Error & { status?: number };

const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  'Authentication verification is temporarily unavailable. Check the server internet connection and try again.';

function createAuthError(message: string, status: number): AuthError {
  const err = new Error(message) as AuthError;
  err.status = status;
  return err;
}

export function getAuthErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as AuthError).status;
  return typeof status === 'number' ? status : null;
}

function isAuthVerificationConnectivityError(error: { code?: string; message?: string }): boolean {
  const message = error.message || '';
  return message.includes('Error while making request') ||
    message.includes('Error while making requests') ||
    /\b(ECONNRESET|ECONNREFUSED|ENETUNREACH|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b/.test(message) ||
    error.code === 'app/network-error' ||
    error.code === 'app/network-timeout';
}

export async function verifyAuthToken(authToken: string): Promise<DecodedIdToken> {
  if (!authToken) {
    throw createAuthError('Unauthorized: missing auth token.', 401);
  }
  const { auth } = initializeFirebase();
  try {
    return await auth.verifyIdToken(authToken);
  } catch (error: unknown) {
    // Keep the actionable Firebase reason in server logs without ever logging
    // the credential itself. The client receives the deliberately generic
    // response below.
    const firebaseError = error as { code?: string; message?: string };
    console.warn('Firebase ID token verification failed.', {
      code: firebaseError.code || 'unknown',
      message: firebaseError.message || 'Unknown verification failure',
    });
    if (isAuthVerificationConnectivityError(firebaseError)) {
      throw createAuthError(AUTH_SERVICE_UNAVAILABLE_MESSAGE, 503);
    }
    throw createAuthError('Unauthorized: invalid auth token.', 401);
  }
}

export async function verifyAuthTokenForUser(authToken: string, expectedUid: string): Promise<DecodedIdToken> {
  const decoded = await verifyAuthToken(authToken);
  if (!expectedUid || decoded.uid !== expectedUid) {
    throw createAuthError('Forbidden: invalid user context.', 403);
  }
  return decoded;
}

export async function verifyAdminOrOwner(authToken: string): Promise<DecodedIdToken> {
  const decoded = await verifyAuthToken(authToken);
  const { firestore } = initializeFirebase();
  const userSnapshot = await firestore.collection('users').doc(decoded.uid).get();
  const userProfile = userSnapshot.exists ? userSnapshot.data() : null;
  const accessSource = {
    role: (userProfile?.role ?? decoded.role) as LegacyRole | null | undefined,
    roles: userProfile?.roles as LegacyRole[] | null | undefined,
    accessRole: (userProfile?.accessRole ?? decoded.accessRole) as AccessRole | null | undefined,
    personas: userProfile?.personas as Persona[] | null | undefined,
    primaryPortal: userProfile?.primaryPortal as PrimaryPortal | null | undefined,
  };

  if (!canViewAdmin(accessSource)) {
    throw createAuthError('Forbidden: insufficient permissions.', 403);
  }
  return decoded;
}

async function getVerifiedAccess(authToken: string) {
  const decoded = await verifyAuthToken(authToken);
  const { firestore } = initializeFirebase();
  const userSnapshot = await firestore.collection('users').doc(decoded.uid).get();
  if (!userSnapshot.exists) {
    throw createAuthError('Forbidden: user profile not found.', 403);
  }

  const userProfile = userSnapshot.data() || {};
  return {
    decoded,
    accessSource: {
      role: (userProfile.role ?? decoded.role) as LegacyRole | null | undefined,
      roles: userProfile.roles as LegacyRole[] | null | undefined,
      accessRole: (userProfile.accessRole ?? decoded.accessRole) as AccessRole | null | undefined,
      personas: userProfile.personas as Persona[] | null | undefined,
      primaryPortal: userProfile.primaryPortal as PrimaryPortal | null | undefined,
    },
  };
}

/** Require a full ADMIN account for any privileged mutation. Owners and staff are read-only. */
export async function verifyAdminWrite(authToken: string): Promise<DecodedIdToken> {
  const { decoded, accessSource } = await getVerifiedAccess(authToken);
  if (!canWriteAdmin(accessSource)) {
    throw createAuthError('Forbidden: administrator write access required.', 403);
  }
  return decoded;
}

/** Require a user with the named operational persona. Admins may perform operational work. */
export async function verifyPersonaOrAdmin(authToken: string, persona: Persona): Promise<DecodedIdToken> {
  const { decoded, accessSource } = await getVerifiedAccess(authToken);
  if (!canWriteAdmin(accessSource) && !hasPersona(accessSource, persona)) {
    throw createAuthError('Forbidden: insufficient permissions.', 403);
  }
  return decoded;
}

export async function verifyAnyPersonaOrAdmin(authToken: string, personas: Persona[]): Promise<DecodedIdToken> {
  const { decoded, accessSource } = await getVerifiedAccess(authToken);
  if (!canWriteAdmin(accessSource) && !personas.some((persona) => hasPersona(accessSource, persona))) {
    throw createAuthError('Forbidden: insufficient permissions.', 403);
  }
  return decoded;
}
