
'use server';

import { adminDb, getAdminApp } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
  normalizeAccessModel,
  resolvePrimaryPortalFromPersonas,
  toLegacyRoleFromAccess,
  type AccessRole,
} from '@/lib/access-control';
import { verifyAdminWrite } from '@/lib/server/auth';

const uploadDocumentSchema = z.object({
    authToken: z.string().min(1),
    userId: z.string().min(1),
    documentUrl: z.string().url().refine(
        (url) => url.startsWith('https://firebasestorage.googleapis.com/'),
        'Document must be stored in Firebase Storage.'
    ),
    storagePath: z.string().startsWith('admin/'),
});

export async function uploadLegalDocumentAction(input: z.infer<typeof uploadDocumentSchema>) {
    const validated = uploadDocumentSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid document data provided.' };
    }

    const { authToken, userId, documentUrl, storagePath } = validated.data;
    await verifyAdminWrite(authToken);
    try {
        const userRef = adminDb.collection('users').doc(userId);
        await userRef.update({
            legalDocumentUrl: documentUrl,
            legalDocumentStoragePath: storagePath,
        });

        revalidatePath(`/admin/users/${userId}`);

        return { success: true, message: 'Legal document uploaded successfully.' };
    } catch(error: any) {
        console.error('Legal Document Upload Error:', error);
        return { success: false, message: error.message || 'Failed to upload document.' };
    }
}

const updateAccessRoleSchema = z.object({
  authToken: z.string().min(1),
  actorId: z.string().min(1),
  targetUserId: z.string().min(1),
  newAccessRole: z.enum(['OWNER', 'ADMIN', 'STAFF', 'USER']),
});

export async function updateAccessRoleAction(input: z.infer<typeof updateAccessRoleSchema>) {
  const validated = updateAccessRoleSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid role update request.' };
  }

  const { authToken, actorId, targetUserId, newAccessRole } = validated.data;

  try {
    const verifiedActor = await verifyAdminWrite(authToken);
    if (verifiedActor.uid !== actorId) {
      return { success: false, message: 'Invalid actor identity.' };
    }
    const actorRef = adminDb.collection('users').doc(actorId);
    const targetRef = adminDb.collection('users').doc(targetUserId);
    const [actorSnap, targetSnap] = await Promise.all([actorRef.get(), targetRef.get()]);

    if (!actorSnap.exists || !targetSnap.exists) {
      return { success: false, message: 'Actor or target user was not found.' };
    }

    const actor = actorSnap.data() || {};
    const target = targetSnap.data() || {};
    const actorModel = normalizeAccessModel(actor as any);
    const targetModel = normalizeAccessModel(target as any);

    if (!(actorModel.accessRole === 'ADMIN' || actorModel.accessRole === 'OWNER')) {
      return { success: false, message: 'You are not allowed to manage owner assignments.' };
    }

    if (targetModel.accessRole === newAccessRole) {
      return { success: true, message: 'No role change needed.' };
    }

    const ownerCountSnapshot = await adminDb
      .collection('users')
      .where('accessRole', '==', 'OWNER')
      .get();
    const ownerCount = ownerCountSnapshot.size;

    const demotingOwner = targetModel.accessRole === 'OWNER' && newAccessRole !== 'OWNER';
    if (demotingOwner && ownerCount <= 1) {
      return { success: false, message: 'Cannot remove the last owner.' };
    }

    const updatedModel = {
      accessRole: newAccessRole as AccessRole,
      personas: targetModel.personas,
      primaryPortal:
        newAccessRole === 'OWNER'
          ? 'owner'
          : newAccessRole === 'ADMIN' || newAccessRole === 'STAFF'
          ? 'admin'
          : resolvePrimaryPortalFromPersonas(targetModel.personas),
    };
    const updatedRole = toLegacyRoleFromAccess(updatedModel);

    await targetRef.update({
      role: updatedRole,
      accessRole: updatedModel.accessRole,
      personas: updatedModel.personas,
      primaryPortal: updatedModel.primaryPortal,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await getAuth(getAdminApp()).setCustomUserClaims(targetUserId, {
      role: updatedRole,
      accessRole: updatedModel.accessRole,
      personas: updatedModel.personas,
      primaryPortal: updatedModel.primaryPortal,
    });

    await adminDb.collection('transactions').add({
      userId: actorId,
      type: 'AccessRoleChange',
      amount: 0,
      details: `Changed ${target.name || target.email || targetUserId} accessRole from ${targetModel.accessRole} to ${newAccessRole}.`,
      createdAt: FieldValue.serverTimestamp(),
    });

    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${targetUserId}`);

    return { success: true, message: `Access role updated to ${newAccessRole}.` };
  } catch (error: any) {
    console.error('Update access role error:', error);
    return { success: false, message: error?.message || 'Failed to update access role.' };
  }
}
