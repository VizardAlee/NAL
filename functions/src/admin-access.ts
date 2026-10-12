import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';

// Profiles are authoritative, so a stale ADMIN token cannot survive demotion.
// Modern accessRole takes precedence even when legacy role is still Admin.
export function profileCanWriteAdmin(profile: Record<string, unknown> | undefined): boolean {
  if (!profile) return false;
  if ('accessRole' in profile) return profile.accessRole === 'ADMIN';
  return profile.role === 'Admin' || (Array.isArray(profile.roles) && profile.roles.includes('Admin'));
}

export async function requireFullAdmin(
  uid: string | undefined,
  readProfile: (uid: string) => Promise<Record<string, unknown> | undefined> = async id =>
    (await admin.firestore().collection('users').doc(id).get()).data(),
) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  if (!profileCanWriteAdmin(await readProfile(uid))) {
    throw new HttpsError('permission-denied', 'Administrator write access is required.');
  }
  return uid;
}

/** Validate revocation/disabled state as well as current profile authority on callable writes. */
export async function requireCallableAdmin(request: CallableRequest<unknown>) {
  const header = request.rawRequest.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  let uid: string;
  try { uid = (await admin.auth().verifyIdToken(header.slice(7).trim(), true)).uid; }
  catch { throw new HttpsError('unauthenticated', 'Your session is no longer valid. Sign in again.'); }
  if (!request.auth?.uid || request.auth.uid !== uid) throw new HttpsError('unauthenticated', 'Invalid user context.');
  return requireFullAdmin(uid);
}
