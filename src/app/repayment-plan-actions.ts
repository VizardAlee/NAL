'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { createRestructuredRepaymentPlan } from '@/lib/amortization';
import { verifyAdminWrite, verifyAuthTokenForUser } from '@/lib/server/auth';
import { notifyAdmins, notifyUser } from '@/lib/server/notification-service';
import type { Deal } from '@/lib/types';

const durationUnit = z.enum(['Days', 'Weeks', 'Fortnights', 'Months', 'Years']);
const repaymentFrequency = z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']);
const repaymentTermsSchema = z.object({
  durationValue: z.coerce.number().int().positive().max(120),
  durationUnit,
  repaymentFrequency,
});
const requestSchema = z.object({
  authToken: z.string().min(1),
  dealId: z.string().min(1).max(180),
  clientId: z.string().min(1).max(180),
  ...repaymentTermsSchema.shape,
  reason: z.string().trim().min(10).max(1_000),
});
const decisionSchema = z.object({
  authToken: z.string().min(1),
  requestId: z.string().min(1).max(180),
  decision: z.enum(['Approved', 'Rejected']),
  adminNote: z.string().trim().max(1_000).optional(),
});

function approximateDays(value: number, unit: z.infer<typeof durationUnit>): number {
  if (unit === 'Days') return value;
  if (unit === 'Weeks') return value * 7;
  if (unit === 'Fortnights') return value * 14;
  if (unit === 'Months') return value * 30.4375;
  return value * 365.25;
}

export async function requestRepaymentPlanChangeAction(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, message: 'Complete all proposed repayment terms and provide a reason.' };
  const data = parsed.data;
  if (approximateDays(data.durationValue, data.durationUnit) > 3652.5) {
    return { success: false as const, message: 'The revised remaining duration cannot exceed 10 years.' };
  }
  try {
    await verifyAuthTokenForUser(data.authToken, data.clientId);
    const now = Timestamp.now();
    const requestRef = adminDb.collection('repaymentPlanChangeRequests').doc();
    const dealRef = adminDb.collection('deals').doc(data.dealId);
    let dealName = '';
    let clientName = '';
    await adminDb.runTransaction(async (transaction) => {
      const dealSnapshot = await transaction.get(dealRef);
      if (!dealSnapshot.exists) throw new Error('Deal not found.');
      const deal = { id: dealSnapshot.id, ...dealSnapshot.data() } as Deal;
      if (deal.clientId !== data.clientId) throw new Error('You are not allowed to change this deal.');
      if (deal.status !== 'Active') throw new Error('Only active deals can be restructured.');
      if (deal.pendingRepaymentPlanChangeRequestId) throw new Error('A repayment-plan change is already awaiting approval.');
      if (
        deal.durationValue === data.durationValue &&
        deal.durationUnit === data.durationUnit &&
        deal.repaymentFrequency === data.repaymentFrequency
      ) throw new Error('The proposed terms are the same as the current repayment plan.');
      const pendingRepayments = await transaction.get(
        adminDb.collection('repayments').where('dealId', '==', data.dealId).where('status', '==', 'Pending')
      );
      if (!pendingRepayments.empty) throw new Error('Wait for the pending repayment to be approved or rejected before requesting a schedule change.');
      dealName = String(deal.dealName || 'Deal');
      clientName = String(deal.clientName || 'Client');
      transaction.create(requestRef, {
        dealId: data.dealId,
        dealName,
        clientId: data.clientId,
        clientName,
        status: 'Pending',
        currentTerms: {
          durationValue: deal.durationValue,
          durationUnit: deal.durationUnit,
          repaymentFrequency: deal.repaymentFrequency,
          repaymentPlanVersion: Number(deal.repaymentPlanVersion || 1),
        },
        proposedTerms: {
          durationValue: data.durationValue,
          durationUnit: data.durationUnit,
          repaymentFrequency: data.repaymentFrequency,
        },
        reason: data.reason,
        requestedAt: now,
      });
      transaction.update(dealRef, { pendingRepaymentPlanChangeRequestId: requestRef.id });
    });
    await notifyAdmins(
      'Repayment Plan Change Requested',
      `${clientName} requested new repayment terms for ${dealName}.`,
      '/admin/approvals/repayment-changes',
      'approval'
    ).catch((error) => console.error('Unable to notify administrators about repayment-plan request.', error));
    revalidatePath(`/client/deals/${data.dealId}`);
    revalidatePath('/client/dashboard');
    return { success: true as const, message: 'Your proposed repayment plan has been sent for administrator approval.' };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : 'Unable to submit the repayment-plan request.' };
  }
}

export async function processRepaymentPlanChangeAction(input: z.infer<typeof decisionSchema>) {
  const data = decisionSchema.parse(input);
  const admin = await verifyAdminWrite(data.authToken);
  const requestRef = adminDb.collection('repaymentPlanChangeRequests').doc(data.requestId);
  let clientId = '';
  let dealId = '';
  let dealName = '';
  await adminDb.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists || requestSnapshot.data()?.status !== 'Pending') {
      throw new Error('This repayment-plan request has already been processed.');
    }
    const request = requestSnapshot.data()!;
    clientId = String(request.clientId);
    dealId = String(request.dealId);
    dealName = String(request.dealName || 'Deal');
    const dealRef = adminDb.collection('deals').doc(dealId);
    const dealSnapshot = await transaction.get(dealRef);
    if (!dealSnapshot.exists) throw new Error('Associated deal not found.');
    const deal = { id: dealSnapshot.id, ...dealSnapshot.data() } as Deal;
    if (deal.pendingRepaymentPlanChangeRequestId !== data.requestId) {
      throw new Error('This request is no longer the active change request for the deal.');
    }
    const now = Timestamp.now();
    if (data.decision === 'Rejected') {
      transaction.update(requestRef, {
        status: 'Rejected', processedAt: now, processedBy: admin.uid,
        ...(data.adminNote ? { adminNote: data.adminNote } : {}),
      });
      transaction.update(dealRef, { pendingRepaymentPlanChangeRequestId: FieldValue.delete() });
      return;
    }
    const [pendingRepayments, approvedRepayments] = await Promise.all([
      transaction.get(adminDb.collection('repayments').where('dealId', '==', dealId).where('status', '==', 'Pending')),
      transaction.get(adminDb.collection('repayments').where('dealId', '==', dealId).where('status', '==', 'Approved')),
    ]);
    if (!pendingRepayments.empty) throw new Error('Process the pending repayment before approving this schedule change.');
    const proposed = repaymentTermsSchema.parse(request.proposedTerms);
    if (approximateDays(proposed.durationValue, proposed.durationUnit) > 3652.5) {
      throw new Error('The revised remaining duration cannot exceed 10 years.');
    }
    const approvedInstallments = [...new Set(approvedRepayments.docs.map((item) => Number(item.data().installmentNumber)).filter(Number.isFinite))];
    const plan = createRestructuredRepaymentPlan({
      deal,
      approvedInstallmentNumbers: approvedInstallments,
      newDurationValue: proposed.durationValue,
      newDurationUnit: proposed.durationUnit,
      newRepaymentFrequency: proposed.repaymentFrequency,
      effectiveDate: now.toDate(),
    });
    const storedPlan = {
      preservedInstallments: plan.preservedInstallments.map((installment) => ({
        ...installment,
        dueDate: Timestamp.fromDate(installment.dueDate),
      })),
      futureSegment: {
        ...plan.futureSegment,
        startDate: Timestamp.fromDate(plan.futureSegment.startDate),
      },
    };
    transaction.update(dealRef, {
      durationValue: proposed.durationValue,
      durationUnit: proposed.durationUnit,
      repaymentFrequency: proposed.repaymentFrequency,
      repaymentPlanOverride: storedPlan,
      repaymentPlanVersion: Number(deal.repaymentPlanVersion || 1) + 1,
      repaymentTermsChangedAt: now,
      pendingRepaymentPlanChangeRequestId: FieldValue.delete(),
    });
    transaction.update(requestRef, {
      status: 'Approved', processedAt: now, processedBy: admin.uid,
      effectiveAt: now,
      preservedInstallmentNumbers: approvedInstallments,
      ...(data.adminNote ? { adminNote: data.adminNote } : {}),
    });
  });
  await notifyUser(
    clientId,
    `Repayment plan ${data.decision.toLowerCase()}`,
    data.decision === 'Approved'
      ? `Your revised repayment terms for ${dealName} are now active.`
      : `Your requested repayment changes for ${dealName} were not approved.`,
    `/client/deals/${dealId}`,
    'system'
  ).catch((error) => console.error('Unable to notify client about repayment-plan decision.', error));
  revalidatePath('/admin/approvals/repayment-changes');
  revalidatePath(`/client/deals/${dealId}`);
  revalidatePath('/client/dashboard');
  return { success: true as const, message: `Repayment-plan request ${data.decision.toLowerCase()}.` };
}
