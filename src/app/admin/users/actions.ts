'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import {
  type AccessRole,
  type Persona,
  type PrimaryPortal,
  resolvePrimaryPortalFromPersonas,
  toLegacyRoleFromAccess,
} from '@/lib/access-control';
import { verifyAdminWrite } from '@/lib/server/auth';

function getInviteBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.FIREBASE_APP_HOSTING_URL ||
    'http://localhost:9002'
  ).replace(/\/$/, '');
}

const inviteSchema = z
  .object({
    authToken: z.string().min(1),
    email: z.string().email(),
    accessRole: z.enum(['OWNER', 'ADMIN', 'STAFF', 'USER']),
    personas: z.array(z.enum(['INVESTOR', 'CLIENT', 'LEGAL', 'RECOVERY', 'MARKETER', 'STAFF_MEMBER'])).default([]),
    primaryPortal: z.enum(['owner', 'admin', 'investor', 'client', 'legal', 'recovery', 'marketer']).optional(),
    isMuslim: z.boolean().optional(),
    inviterId: z.string().min(1),
    inviterName: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.personas.includes('INVESTOR') && typeof data.isMuslim !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isMuslim'],
        message: 'Investor religious classification is required.',
      });
    }
  });

export async function createInviteLinkAction(data: z.infer<typeof inviteSchema>): Promise<{
  success: boolean;
  message: string;
  inviteLink?: string;
}> {
  const validated = inviteSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, message: 'Invalid invite data.' };
  }

  const {
    authToken,
    email,
    accessRole,
    personas,
    primaryPortal: requestedPortal,
    isMuslim,
    inviterId,
    inviterName,
  } = validated.data;
  const actor = await verifyAdminWrite(authToken);
  if (actor.uid !== inviterId) {
    return { success: false, message: 'Invalid inviter identity.' };
  }
  const normalizedEmail = email.toLowerCase();
  const dedupedPersonas = [...new Set(personas)] as Persona[];
  const resolvedPrimaryPortal = (
    requestedPortal ||
    (accessRole === 'OWNER'
      ? 'owner'
      : accessRole === 'ADMIN' || accessRole === 'STAFF'
      ? 'admin'
      : resolvePrimaryPortalFromPersonas(dedupedPersonas))
  ) as PrimaryPortal;
  const legacyRole = toLegacyRoleFromAccess({
    accessRole: accessRole as AccessRole,
    personas: dedupedPersonas,
    primaryPortal: resolvedPrimaryPortal,
  });

  try {
    const existingUser = await adminDb
      .collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();
    if (!existingUser.empty) {
      return { success: false, message: 'A user with this email already exists.' };
    }

    const existingInvite = await adminDb
      .collection('invites')
      .where('email', '==', normalizedEmail)
      .where('status', '==', 'Pending')
      .limit(1)
      .get();
    if (!existingInvite.empty) {
      const inviteRef = existingInvite.docs[0].ref;
      const token = inviteRef.id;
      await inviteRef.update({
        accessRole,
        personas: dedupedPersonas,
        primaryPortal: resolvedPrimaryPortal,
        role: legacyRole,
        isMuslim: dedupedPersonas.includes('INVESTOR') ? isMuslim : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: inviterId,
        createdByName: inviterName,
      });
      const baseUrl = getInviteBaseUrl();
      return {
        success: true,
        message: 'A pending invite already exists for this email.',
        inviteLink: `${baseUrl}/signup?invite=${token}`,
      };
    }

    const token = randomBytes(24).toString('hex');
    await adminDb.collection('invites').doc(token).set({
      email: normalizedEmail,
      accessRole,
      personas: dedupedPersonas,
      primaryPortal: resolvedPrimaryPortal,
      role: legacyRole,
      ...(dedupedPersonas.includes('INVESTOR') ? { isMuslim } : {}),
      status: 'Pending',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: inviterId,
      createdByName: inviterName,
    });

    const baseUrl = getInviteBaseUrl();
    return {
      success: true,
      message: 'Invite link generated successfully.',
      inviteLink: `${baseUrl}/signup?invite=${token}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Failed to generate invite link.',
    };
  }
}
