import { DecodedIdToken } from 'firebase-admin/auth';
import { initializeFirebase } from '@/firebase/server';

type AuthError = Error & { status?: number };

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

export async function verifyAuthToken(authToken: string): Promise<DecodedIdToken> {
  if (!authToken) {
    throw createAuthError('Unauthorized: missing auth token.', 401);
  }
  const { auth } = initializeFirebase();
  try {
    return await auth.verifyIdToken(authToken);
  } catch {
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
  const accessRole = (decoded.accessRole as string | undefined) || '';
  const legacyRole = (decoded.role as string | undefined) || '';
  const canManageDeals =
    accessRole === 'OWNER' ||
    accessRole === 'ADMIN' ||
    accessRole === 'STAFF' ||
    legacyRole === 'Admin';
  if (!canManageDeals) {
    throw createAuthError('Forbidden: insufficient permissions.', 403);
  }
  return decoded;
}
