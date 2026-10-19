
'use server';

import { adminDb, getAdminApp } from '@/firebase/admin-app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
  hasPersona,
} from '@/lib/access-control';
import { verifyAdminWrite } from '@/lib/server/auth';
import { changeAccessRole } from '@/lib/server/role-change';

const createDepositRequestSchema = z.object({
  authToken: z.string().min(1),
  userId: z.string().min(1),
  amount: z.coerce.number().positive(),
  tenureValue: z.coerce.number().int().positive(),
  tenureUnit: z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']),
  paymentDate: z.string().date().optional(),
  specialInvestment: z.boolean().default(false),
}).refine(({ tenureValue, tenureUnit }) => tenureValue <= ({ Days: 3650, Weeks: 520, Fortnights: 260, Months: 120, Years: 10 } as const)[tenureUnit], {
  message: 'Investment term cannot exceed ten years.',
  path: ['tenureValue'],
});

export async function createAdminDepositRequestAction(input: z.infer<typeof createDepositRequestSchema>) {
  const validated = createDepositRequestSchema.safeParse(input);
  if (!validated.success) return { success: false, message: 'Invalid deposit request.' };

  try {
    const actor = await verifyAdminWrite(validated.data.authToken);
    const investor = await adminDb.collection('users').doc(validated.data.userId).get();
    if (!investor.exists) return { success: false, message: 'Investor not found.' };
    if (!hasPersona(investor.data() || {}, 'INVESTOR')) return { success: false, message: 'The selected user is not registered as an investor.' };
    const requestRef = adminDb.collection('depositRequests').doc();
    const paymentDate = validated.data.paymentDate
      ? Timestamp.fromDate(new Date(`${validated.data.paymentDate}T12:00:00+01:00`))
      : Timestamp.now();
    await requestRef.set({
      investorId: validated.data.userId,
      investorName: investor.data()?.name || investor.data()?.email || 'Investor',
      amount: validated.data.amount,
      tenureValue: validated.data.tenureValue,
      tenureUnit: validated.data.tenureUnit,
      paymentDate,
      paymentReference: `NAL-DEP-${requestRef.id.toUpperCase()}`,
      specialInvestment: validated.data.specialInvestment,
      status: 'Pending',
      requestedAt: FieldValue.serverTimestamp(),
      requestedByAdminId: actor.uid,
      agreementSigningRequired: true,
    });
    revalidatePath(`/admin/users/${validated.data.userId}`);
    revalidatePath('/admin/approvals/deposits');
    return { success: true, message: 'Deposit request created. Complete the investor agreement before approving it.' };
  } catch (error: any) {
    console.error('Create admin deposit request error:', error);
    return { success: false, message: error?.message || 'Failed to create the deposit request.' };
  }
}

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
  targetUserId: z.string().min(1).max(128).refine(value => !value.includes('/')),
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
    const result = await changeAccessRole(adminDb, getAuth(getAdminApp()), actorId, targetUserId, newAccessRole);
    if (!result.success) return result;

    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${targetUserId}`);

    return result;
  } catch (error: any) {
    console.error('Update access role error:', error);
    return { success: false, message: error?.message || 'Failed to update access role.' };
  }
}
