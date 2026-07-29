'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { processOwnerProfitAllocations } from '@/lib/server/owner-profit';
import { verifyAdminWrite } from '@/lib/server/auth';

const ownerPolicySchema = z.object({
  authToken: z.string().min(1),
  retainedPercent: z.coerce.number().min(0).max(100),
  distributablePercent: z.coerce.number().min(0).max(100),
  totalShares: z.coerce.number().int().positive(),
  allocationStartDate: z.string().optional(),
  actorId: z.string().min(1),
});

export async function upsertOwnerProfitPolicyAction(input: z.infer<typeof ownerPolicySchema>) {
  const parsed = ownerPolicySchema.safeParse(input);
  if (!parsed.success) return { success: false, message: 'Invalid owner policy input.' };

  const { authToken, retainedPercent, distributablePercent, totalShares, allocationStartDate, actorId } = parsed.data;
  const actor = await verifyAdminWrite(authToken);
  if (actor.uid !== actorId) return { success: false, message: 'Invalid actor identity.' };
  if (retainedPercent + distributablePercent !== 100) {
    return { success: false, message: 'Retained and distributable percentages must sum to 100.' };
  }

  try {
    await adminDb.collection('platformPolicies').doc('ownerProfit').set(
      {
        retainedPercent,
        distributablePercent,
        totalShares,
        allocationStartDate: allocationStartDate
          ? Timestamp.fromDate(new Date(`${allocationStartDate}T00:00:00`))
          : null,
        withdrawalCooldown: 'QUARTERLY',
        updatedBy: actorId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true, message: 'Owner profit policy saved.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to save policy.' };
  }
}

const ownerPartnerSchema = z.object({
  authToken: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  shareUnits: z.coerce.number().int().positive(),
  active: z.boolean().default(true),
  actorId: z.string().min(1),
});

export async function upsertOwnershipPartnerAction(input: z.infer<typeof ownerPartnerSchema>) {
  const parsed = ownerPartnerSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: 'Invalid partner input.' };

  const { authToken, userId, displayName, shareUnits, active, actorId } = parsed.data;
  const actor = await verifyAdminWrite(authToken);
  if (actor.uid !== actorId) return { success: false, message: 'Invalid actor identity.' };

  try {
    await adminDb.collection('ownershipPartners').doc(userId).set(
      {
        userId,
        displayName,
        shareUnits,
        active,
        updatedBy: actorId,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true, message: 'Ownership partner saved.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to save owner partner.' };
  }
}

const togglePartnerSchema = z.object({
  authToken: z.string().min(1),
  userId: z.string().min(1),
  active: z.boolean(),
  actorId: z.string().min(1),
});

export async function setOwnershipPartnerActiveAction(input: z.infer<typeof togglePartnerSchema>) {
  const parsed = togglePartnerSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: 'Invalid status update request.' };

  const { authToken, userId, active, actorId } = parsed.data;
  const actor = await verifyAdminWrite(authToken);
  if (actor.uid !== actorId) return { success: false, message: 'Invalid actor identity.' };
  try {
    await adminDb.collection('ownershipPartners').doc(userId).set(
      {
        active,
        updatedBy: actorId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { success: true, message: 'Partner status updated.' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to update partner status.' };
  }
}

const allocationRunSchema = z.object({
  authToken: z.string().min(1),
  includeHistorical: z.boolean().default(false),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
});

export async function runOwnerProfitAllocationAction(input?: Partial<z.infer<typeof allocationRunSchema>>) {
  const parsed = allocationRunSchema.safeParse(input || {});
  if (!parsed.success) return { success: false, message: 'Invalid allocation run input.' };

  const { authToken, includeHistorical, fromDate, toDate, limit } = parsed.data;
  await verifyAdminWrite(authToken);

  try {
    const result = await processOwnerProfitAllocations({
      includeHistorical,
      fromDate: fromDate ? new Date(`${fromDate}T00:00:00`) : undefined,
      toDate: toDate ? new Date(`${toDate}T23:59:59`) : undefined,
      limit,
    });

    return result;
  } catch (error: any) {
    return { success: false, message: error?.message || 'Allocation run failed.' };
  }
}
