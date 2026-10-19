import 'server-only';
import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { normalizeAccessModel, resolvePrimaryPortalFromPersonas, toLegacyRoleFromAccess, type AccessRole } from '@/lib/access-control';

/** Firestore profile + audit + recovery intent commit atomically. Auth cannot join
 * that transaction. One durable, non-expiring lock prevents overlapping Auth
 * writers here. Never steal a lock on a timer: a paused writer could regrant an
 * obsolete role. An interrupted WORKING operation requires operator review after
 * confirming its writer has stopped; definitively rejected or confirmed writes remain retryable.
 * All callers must authenticate before entering; actor authority is rechecked here.
 */
export async function changeAccessRole(db: Firestore, auth: Auth, actorId: string, uid: string, requestedRole: AccessRole) {
  const targetRef = db.doc(`users/${uid}`);
  const stateRef = db.doc(`roleChangeOperations/${uid}`); // No client rule grants access.
  const operationId = randomUUID();
  const workerId = randomUUID();
  const staged = await db.runTransaction(async tx => {
    const [actorSnap, targetSnap, stateSnap] = await Promise.all([
      tx.get(db.doc(`users/${actorId}`)), tx.get(targetRef), tx.get(stateRef),
    ]);
    if (!actorSnap.exists || !targetSnap.exists) throw Error('Actor or target user was not found.');
    if (normalizeAccessModel(actorSnap.data() as any).accessRole !== 'ADMIN') throw Error('Administrator write access required.');
    const target = targetSnap.data()!;
    const current = normalizeAccessModel(target as any);
    const state = stateSnap.data();
    if (state?.status === 'WORKING') return {kind:'locked' as const,requiresReview:state.requiresReview === true};
    if (state?.status === 'PENDING') {
      if (state.claims.accessRole !== requestedRole) throw Error('Finish the pending access synchronization before changing this role again.');
      if (!sameAccess(target, state.claims)) throw Error('Profile changed outside the pending operation. Access synchronization requires review.');
      tx.update(stateRef, { status: 'WORKING', workerId, lastAttemptAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() });
      return { kind:'sync' as const, id: state.operationId as string, claims: state.claims as Record<string, any> };
    }
    // Even an unchanged role may need claims repaired (including pre-release
    // partial failures). The sync operation is durable, but is not a new role audit.
    const changing = current.accessRole !== requestedRole;
    if (changing) {
      const owners = await tx.get(db.collection('users').where('accessRole', '==', 'OWNER'));
      if (current.accessRole === 'OWNER' && requestedRole !== 'OWNER' && owners.size <= 1) throw Error('Cannot remove the last owner.');
    }
    const model = { accessRole: requestedRole, personas: current.personas,
      primaryPortal: !changing ? current.primaryPortal : requestedRole === 'OWNER' ? 'owner' as const : requestedRole === 'ADMIN' || requestedRole === 'STAFF' ? 'admin' as const : resolvePrimaryPortalFromPersonas(current.personas) };
    const claims = { ...model, role: toLegacyRoleFromAccess(model) };
    if (changing) {
      tx.update(targetRef, { ...claims, updatedAt: FieldValue.serverTimestamp() });
      tx.create(db.doc(`transactions/accessRole_${operationId}`), { userId: actorId, type: 'AccessRoleChange', amount: 0,
        operationId, targetUserId: uid, details: `Changed ${target.name || target.email || uid} accessRole from ${current.accessRole} to ${requestedRole}.`, createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(stateRef, { operationId, actorId, targetUserId: uid, claims, status: 'WORKING', workerId, startedAt: FieldValue.serverTimestamp(), lastAttemptAt: FieldValue.serverTimestamp() });
    return { kind:'sync' as const, id: operationId, claims };
  });
  if (staged.kind === 'locked') return { success: false, pending: true, message: staged.requiresReview
    ? 'Auth write outcome is uncertain. Automatic retry is blocked; administrator review is required.'
    : 'Access synchronization is already in progress. Retry after it finishes. If interrupted, administrator review is required; the lock is never automatically taken over.' };
  let claimsAttempted = false;
  let claimsConfirmed = false;
  try {
    if (!sameAccess((await targetRef.get()).data() || {}, staged.claims)) throw Error('Profile changed outside this operation; review required.');
    // Preserve unrelated claims. No token revocation or credentials are involved.
    const existing = (await auth.getUser(uid)).customClaims || {};
    claimsAttempted = true;
    await auth.setCustomUserClaims(uid, { ...existing, ...staged.claims });
    claimsConfirmed = true;
    await db.runTransaction(async tx => {
      const [state, target] = await Promise.all([tx.get(stateRef), tx.get(targetRef)]);
      if (state.data()?.operationId !== staged.id || state.data()?.workerId !== workerId || !sameAccess(target.data() || {}, staged.claims)) throw Error('Profile or synchronization operation changed; review required.');
      tx.update(stateRef, { status: 'COMPLETE', completedAt: FieldValue.serverTimestamp(), workerId: FieldValue.delete(), lastError: FieldValue.delete() });
    });
    return { success: true, message: `Access role ${requestedRole} synchronized. Existing sessions refresh their claims on token refresh.` };
  } catch (error) {
    // A settled promise does NOT prove an unacknowledged remote write stopped.
    // Ambiguous failures retain the non-expiring lock, including after an SDK
    // timeout. Only rejection/no attempted write/confirmed completion can retry.
    const uncertain = claimsAttempted && !claimsConfirmed && !definitivelyRejected(error);
    await db.runTransaction(async tx => {
      const state = await tx.get(stateRef);
      if (state.data()?.operationId === staged.id && state.data()?.workerId === workerId) tx.update(stateRef, {
        ...(uncertain ? {status:'WORKING',requiresReview:true,claimsOutcome:'UNCERTAIN'}
          : {status:'PENDING',workerId:FieldValue.delete(),claimsOutcome:claimsConfirmed ? 'CONFIRMED' : 'NOT_APPLIED'}),
        lastError: error instanceof Error ? error.message : 'Synchronization failed',
      });
    });
    if (uncertain) return {success:false,pending:true,message:'Profile and audit are saved. Auth write outcome is uncertain; automatic retry is blocked. Administrator review is required.'};
    return { success: false, pending: true, message: 'Profile and audit are saved; access synchronization is pending. Retry the current role to finish. ' + (error instanceof Error ? error.message : '') };
  }
}
function sameAccess(profile: Record<string, any>, claims: Record<string, any>) {
  const model = normalizeAccessModel(profile);
  return model.accessRole === claims.accessRole && JSON.stringify(model.personas) === JSON.stringify(claims.personas)
    && (!profile.primaryPortal || profile.primaryPortal === claims.primaryPortal);
}

// Explicit non-mutating rejections. Internal/transport/unknown errors stay locked.
function definitivelyRejected(error: unknown) {
  const code = (error as {code?:string} | null)?.code;
  return ['auth/invalid-argument','auth/invalid-claims','auth/claims-too-large','auth/insufficient-permission'].includes(code || '');
}
