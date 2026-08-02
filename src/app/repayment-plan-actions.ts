'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { createRestructuredRepaymentPlan, generateAmortizationSchedule } from '@/lib/amortization';
import { verifyAdminWrite, verifyAuthTokenForUser } from '@/lib/server/auth';
import { notifyAdmins, notifyUser } from '@/lib/server/notification-service';
import type { Deal } from '@/lib/types';

const repaymentFrequency = z.enum(['Daily', 'Weekly', 'Fortnightly', 'Monthly']);
const requestSchema = z.object({
  authToken: z.string().min(1),
  dealId: z.string().min(1).max(180),
  clientId: z.string().min(1).max(180),
  repaymentFrequency,
  reason: z.string().trim().min(10).max(1_000),
});
const decisionSchema = z.object({
  authToken: z.string().min(1),
  requestId: z.string().min(1).max(180),
  decision: z.enum(['Approved', 'Rejected']),
  adminNote: z.string().trim().max(1_000).optional(),
});

export async function requestRepaymentPlanChangeAction(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, message: 'Choose a proposed repayment frequency and provide a reason.' };
  const data = parsed.data;
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
      if (deal.pendingRepaymentPlanChangeRequestId) throw new Error('A repayment-frequency change is already awaiting approval.');
      if (
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
          repaymentFrequency: data.repaymentFrequency,
        },
        reason: data.reason,
        requestedAt: now,
      });
      transaction.update(dealRef, { pendingRepaymentPlanChangeRequestId: requestRef.id });
    });
    await notifyAdmins(
      'Repayment Frequency Change Requested',
      `${clientName} requested a new repayment frequency for ${dealName}.`,
      '/admin/approvals/repayment-changes',
      'approval'
    ).catch((error) => console.error('Unable to notify administrators about repayment-plan request.', error));
    revalidatePath(`/client/deals/${data.dealId}`);
    revalidatePath('/client/dashboard');
    return { success: true as const, message: 'Your proposed repayment frequency has been sent for administrator approval.' };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : 'Unable to submit the repayment-frequency request.' };
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
    const proposed = z.object({ repaymentFrequency }).parse(request.proposedTerms);
    const approvedInstallments = [...new Set(approvedRepayments.docs.map((item) => Number(item.data().installmentNumber)).filter(Number.isFinite))];
    const currentSchedule = generateAmortizationSchedule(deal);
    const maturityDate = currentSchedule.at(-1)?.dueDate;
    if (!maturityDate || maturityDate <= now.toDate()) throw new Error('The deal has reached its repayment maturity and can no longer change frequency.');
    const plan = createRestructuredRepaymentPlan({
      deal,
      approvedInstallmentNumbers: approvedInstallments,
      newDurationValue: deal.durationValue,
      newDurationUnit: deal.durationUnit,
      newRepaymentFrequency: proposed.repaymentFrequency,
      effectiveDate: now.toDate(),
      maturityDate,
    });
    const storedPlan = {
      preservedInstallments: plan.preservedInstallments.map((installment) => ({
        ...installment,
        dueDate: Timestamp.fromDate(installment.dueDate),
      })),
      futureSegment: {
        ...plan.futureSegment,
        startDate: Timestamp.fromDate(plan.futureSegment.startDate),
        ...(plan.futureSegment.endDate ? { endDate: Timestamp.fromDate(plan.futureSegment.endDate) } : {}),
      },
    };
    transaction.update(dealRef, {
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
    `Repayment frequency ${data.decision.toLowerCase()}`,
    data.decision === 'Approved'
      ? `Your revised repayment frequency for ${dealName} is now active. The maturity date is unchanged.`
      : `Your requested repayment-frequency change for ${dealName} was not approved.`,
    `/client/deals/${dealId}`,
    'system'
  ).catch((error) => console.error('Unable to notify client about repayment-plan decision.', error));
  revalidatePath('/admin/approvals/repayment-changes');
  revalidatePath(`/client/deals/${dealId}`);
  revalidatePath('/client/dashboard');
  return { success: true as const, message: `Repayment-frequency request ${data.decision.toLowerCase()}.` };
}
