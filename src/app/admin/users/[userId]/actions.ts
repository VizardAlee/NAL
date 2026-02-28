
'use server';

import { adminDb } from '@/firebase/admin-app';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { normalizeAccessModel } from '@/lib/access-control';


const payZakatSchema = z.object({
  userId: z.string().min(1),
  zakatAmount: z.coerce.number().positive(),
  investibleBalance: z.coerce.number(),
});

export async function payZakatAction(input: z.infer<typeof payZakatSchema>) {
  const validated = payZakatSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid data provided for Zakat payment.' };
  }

  const { userId, zakatAmount, investibleBalance } = validated.data;
  
  if (investibleBalance < zakatAmount) {
      return { success: false, message: 'Insufficient investible balance to pay Zakat.' };
  }

  try {
    const firestore = adminDb;
    
    // Use a transaction to ensure atomicity
    await firestore.runTransaction(async (transaction) => {
        let amountToDeduct = zakatAmount;

        // 1. Find the user's fund batches, oldest first, that have a remaining balance
        const fundBatchesQuery = firestore.collection('fundBatches')
            .where('sourceId', '==', userId)
            .where('remainingAmount', '>', 0)
            .orderBy('createdAt', 'asc');
        
        const batchesSnapshot = await transaction.get(fundBatchesQuery);

        if (batchesSnapshot.empty) {
            throw new Error("No fund batches with a remaining balance were found for this user.");
        }

        // 2. Deduct from batches FIFO style
        for (const batchDoc of batchesSnapshot.docs) {
            if (amountToDeduct <= 0) break;

            const batchRef = batchDoc.ref;
            const batchData = batchDoc.data();
            const deduction = Math.min(amountToDeduct, batchData.remainingAmount);

            transaction.update(batchRef, { remainingAmount: FieldValue.increment(-deduction) });
            amountToDeduct -= deduction;
        }

        if (amountToDeduct > 0) {
            // This case should be prevented by the initial balance check, but it's a good safeguard.
            throw new Error("Could not deduct the full Zakat amount from the available batches.");
        }

        // 3. Create a Zakat transaction record
        const transactionRef = firestore.collection('transactions').doc();
        transaction.set(transactionRef, {
            userId: userId,
            type: 'Zakat',
            amount: -zakatAmount, // Negative amount as it's a deduction
            createdAt: FieldValue.serverTimestamp(),
            details: 'Annual Zakat Payment'
        });

        // 4. Update the user's last Zakat payment date in their user document
        const userRef = firestore.collection('users').doc(userId);
        transaction.update(userRef, {
            lastZakatPaymentDate: FieldValue.serverTimestamp()
        });
    });

    return { success: true, message: `Zakat of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(zakatAmount)} paid successfully.` };

  } catch (error: any) {
    console.error('Pay Zakat Error:', error);
    return { success: false, message: error.message || 'An unknown error occurred while processing Zakat payment.' };
  }
}

const uploadDocumentSchema = z.object({
    userId: z.string().min(1),
    documentUrl: z.string().startsWith('data:'),
});

export async function uploadLegalDocumentAction(input: z.infer<typeof uploadDocumentSchema>) {
    const validated = uploadDocumentSchema.safeParse(input);
    if (!validated.success) {
        return { success: false, message: 'Invalid document data provided.' };
    }

    const { userId, documentUrl } = validated.data;
    try {
        const userRef = adminDb.collection('users').doc(userId);
        await userRef.update({
            legalDocumentUrl: documentUrl
        });

        revalidatePath(`/admin/users/${userId}`);

        return { success: true, message: 'Legal document uploaded successfully.' };
    } catch(error: any) {
        console.error('Legal Document Upload Error:', error);
        return { success: false, message: error.message || 'Failed to upload document.' };
    }
}

const updateAccessRoleSchema = z.object({
  actorId: z.string().min(1),
  targetUserId: z.string().min(1),
  newAccessRole: z.enum(['OWNER', 'ADMIN', 'STAFF', 'USER']),
});

export async function updateAccessRoleAction(input: z.infer<typeof updateAccessRoleSchema>) {
  const validated = updateAccessRoleSchema.safeParse(input);
  if (!validated.success) {
    return { success: false, message: 'Invalid role update request.' };
  }

  const { actorId, targetUserId, newAccessRole } = validated.data;

  try {
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

    await targetRef.update({
      accessRole: newAccessRole,
      updatedAt: FieldValue.serverTimestamp(),
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
