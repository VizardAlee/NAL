'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import { generateAmortizationSchedule } from '@/lib/amortization';
import { processOwnerProfitAllocations } from '@/lib/server/owner-profit';

const decisionSchema = z.object({
  authToken: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(['Approved', 'Rejected']),
  specialInvestment: z.boolean().optional().default(false),
});

type DecisionInput = {
  authToken: string;
  requestId: string;
  decision: 'Approved' | 'Rejected';
  specialInvestment?: boolean;
};

function parseDecision(input: DecisionInput) {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid approval request.');
  return parsed.data;
}

export async function processDepositRequestAction(input: DecisionInput) {
  const data = parseDecision(input);
  await verifyAdminWrite(data.authToken);
  await adminDb.runTransaction(async (trx) => {
    const requestRef = adminDb.collection('depositRequests').doc(data.requestId);
    const snapshot = await trx.get(requestRef);
    if (!snapshot.exists || snapshot.data()?.status !== 'Pending') throw new Error('This deposit request has already been processed.');
    const request = snapshot.data()!;
    trx.update(requestRef, { status: data.decision, processedAt: FieldValue.serverTimestamp() });
    if (data.decision === 'Rejected') return;
    const now = Timestamp.now();
    trx.set(adminDb.collection('fundBatches').doc(), {
      sourceId: request.investorId, amount: request.amount, remainingAmount: request.amount,
      createdAt: now, tenureValue: 10, tenureUnit: 'Years', specialInvestment: data.specialInvestment,
      sourceRequestId: data.requestId,
    });
    trx.set(adminDb.collection('transactions').doc(), {
      userId: request.investorId, type: 'Deposit', amount: request.amount, createdAt: now,
      details: 'Investor Deposit', sourceRequestId: data.requestId,
    });
  });
  return { success: true, message: `Deposit request ${data.decision.toLowerCase()}.` };
}

export async function processReinvestmentRequestAction(input: DecisionInput) {
  const data = parseDecision(input);
  await verifyAdminWrite(data.authToken);
  await adminDb.runTransaction(async (trx) => {
    const requestRef = adminDb.collection('reinvestmentRequests').doc(data.requestId);
    const snapshot = await trx.get(requestRef);
    if (!snapshot.exists || snapshot.data()?.status !== 'Pending') throw new Error('This reinvestment request has already been processed.');
    const request = snapshot.data()!;
    trx.update(requestRef, { status: data.decision, processedAt: FieldValue.serverTimestamp() });
    if (data.decision === 'Rejected') return;
    const now = Timestamp.now();
    for (const tx of [
      { type: 'Withdrawal', amount: -request.amount },
      { type: 'Deposit', amount: request.amount },
    ]) {
      trx.set(adminDb.collection('transactions').doc(), {
        userId: request.investorId, ...tx, createdAt: now, details: 'Profit Reinvestment', sourceRequestId: data.requestId,
      });
    }
    trx.set(adminDb.collection('fundBatches').doc(), {
      sourceId: request.investorId, amount: request.amount, remainingAmount: request.amount,
      createdAt: now, tenureValue: 10, tenureUnit: 'Years', specialInvestment: data.specialInvestment,
      sourceRequestId: data.requestId,
    });
  });
  return { success: true, message: `Reinvestment request ${data.decision.toLowerCase()}.` };
}

export async function processWithdrawalRequestAction(input: DecisionInput) {
  const data = parseDecision(input);
  await verifyAdminWrite(data.authToken);
  await adminDb.runTransaction(async (trx) => {
    const requestRef = adminDb.collection('withdrawalRequests').doc(data.requestId);
    const requestSnapshot = await trx.get(requestRef);
    if (!requestSnapshot.exists || requestSnapshot.data()?.status !== 'Pending') throw new Error('This withdrawal request has already been processed.');
    const request = requestSnapshot.data()!;
    const userId = request.investorId || request.userId;
    if (!userId) throw new Error('Withdrawal request has no user.');
    const batchesSnapshot = data.decision === 'Approved'
      ? await trx.get(adminDb.collection('fundBatches').where('sourceId', '==', userId).where('remainingAmount', '>', 0).orderBy('createdAt', 'asc'))
      : null;
    trx.update(requestRef, { status: data.decision, processedAt: FieldValue.serverTimestamp() });
    if (data.decision === 'Rejected') return;
    let remaining = Math.abs(Number(request.amount));
    for (const batch of batchesSnapshot!.docs) {
      if (remaining <= 0) break;
      const deduction = Math.min(Number(batch.data().remainingAmount), remaining);
      trx.update(batch.ref, { remainingAmount: FieldValue.increment(-deduction) });
      remaining -= deduction;
    }
    if (remaining > 0.01) throw new Error('Insufficient investible balance for this withdrawal.');
    trx.set(adminDb.collection('transactions').doc(), {
      userId, type: 'Withdrawal', amount: -Math.abs(Number(request.amount)), createdAt: Timestamp.now(), sourceRequestId: data.requestId,
    });
  });
  return { success: true, message: `Withdrawal request ${data.decision.toLowerCase()}.` };
}

export async function processRepaymentRequestAction(input: Omit<DecisionInput, 'specialInvestment'>) {
  const data = parseDecision({ ...input, specialInvestment: false });
  await verifyAdminWrite(data.authToken);
  await adminDb.runTransaction(async (trx) => {
    const repaymentRef = adminDb.collection('repayments').doc(data.requestId);
    const repaymentSnapshot = await trx.get(repaymentRef);
    if (!repaymentSnapshot.exists || repaymentSnapshot.data()?.status !== 'Pending') throw new Error('This repayment has already been processed.');
    if (data.decision === 'Rejected') {
      trx.update(repaymentRef, { status: 'Rejected', processedAt: FieldValue.serverTimestamp() });
      return;
    }
    const repayment = repaymentSnapshot.data()!;
    const dealRef = adminDb.collection('deals').doc(repayment.dealId);
    const [dealSnapshot, investmentsSnapshot] = await Promise.all([
      trx.get(dealRef),
      trx.get(adminDb.collection('investments').where('dealId', '==', repayment.dealId)),
    ]);
    if (!dealSnapshot.exists) throw new Error('Associated deal not found.');
    if (investmentsSnapshot.empty) throw new Error('No investors found for this deal.');
    const deal = { id: dealSnapshot.id, ...dealSnapshot.data() } as any;
    const installment = generateAmortizationSchedule(deal).find((item) => item.installment === (repayment.installmentNumber || 1));
    if (!installment) throw new Error('Matching repayment installment was not found.');
    const totalInvested = investmentsSnapshot.docs.reduce((sum, item) => sum + Number(item.data().amount), 0);
    if (totalInvested <= 0) throw new Error('Investment total is invalid.');
    const now = Timestamp.now();
    for (const investmentSnapshot of investmentsSnapshot.docs) {
      const investment = investmentSnapshot.data();
      const proportion = Number(investment.amount) / totalInvested;
      const investorProfit = installment.interest * proportion * 0.4;
      const principalReturned = installment.principal * proportion;
      trx.set(adminDb.collection('transactions').doc(), {
        userId: investment.investorId, dealId: repayment.dealId, type: 'ProfitDistribution', amount: investorProfit,
        createdAt: now, dealName: deal.dealName, sourceRequestId: data.requestId,
      });
      if (principalReturned > 0) trx.set(adminDb.collection('fundBatches').doc(), {
        sourceId: investment.investorId, amount: principalReturned, remainingAmount: principalReturned,
        createdAt: now, tenureValue: 0, tenureUnit: 'Days', specialInvestment: Boolean(investment.specialInvestment), sourceRequestId: data.requestId,
      });
    }
    const platformProfit = installment.interest * 0.6;
    trx.set(adminDb.collection('transactions').doc(), {
      userId: 'platform', dealId: repayment.dealId, type: 'PlatformEarning', amount: platformProfit,
      createdAt: now, dealName: deal.dealName, ownerAllocatable: true, platformEarningKind: 'Operating', sourceRequestId: data.requestId,
    });
    trx.set(adminDb.collection('fundBatches').doc(), {
      sourceId: 'platform', amount: platformProfit, remainingAmount: platformProfit, createdAt: now,
      tenureValue: 10, tenureUnit: 'Years', sourceRequestId: data.requestId,
    });
    trx.set(adminDb.collection('transactions').doc(), {
      userId: repayment.clientId, dealId: repayment.dealId, type: 'Repayment', amount: -installment.principal,
      createdAt: now, dealName: deal.dealName, sourceRequestId: data.requestId,
    });
    trx.update(repaymentRef, { status: 'Approved', approvedAt: now });
  });
  if (data.decision === 'Approved') await processOwnerProfitAllocations({ includeHistorical: false, limit: 200 });
  return { success: true, message: `Repayment ${data.decision.toLowerCase()}.` };
}

export async function processTerminationRequestAction(input: Omit<DecisionInput, 'specialInvestment'>) {
  const data = parseDecision({ ...input, specialInvestment: false });
  await verifyAdminWrite(data.authToken);
  await adminDb.runTransaction(async (trx) => {
    const requestRef = adminDb.collection('terminationRequests').doc(data.requestId);
    const requestSnapshot = await trx.get(requestRef);
    if (!requestSnapshot.exists || requestSnapshot.data()?.status !== 'Pending') throw new Error('This termination request has already been processed.');
    if (data.decision === 'Rejected') {
      trx.update(requestRef, { status: 'Rejected', processedAt: FieldValue.serverTimestamp() });
      return;
    }
    const request = requestSnapshot.data()!;
    const dealRef = adminDb.collection('deals').doc(request.dealId);
    const [dealSnapshot, investmentsSnapshot, repaymentsSnapshot] = await Promise.all([
      trx.get(dealRef),
      trx.get(adminDb.collection('investments').where('dealId', '==', request.dealId)),
      trx.get(adminDb.collection('repayments').where('dealId', '==', request.dealId).where('status', '==', 'Pending')),
    ]);
    if (!dealSnapshot.exists) throw new Error('Deal not found.');
    const deal = { id: dealSnapshot.id, ...dealSnapshot.data() } as any;
    if (deal.status === 'Terminated') throw new Error('Deal is already terminated.');
    const now = Timestamp.now();
    const schedule = generateAmortizationSchedule(deal);
    const installment = schedule.find((item) => item.dueDate.getTime() >= now.toMillis()) || schedule.at(-1);
    const finalInterest = installment?.interest || 0;
    const remainingPrincipal = deal.repaymentType === 'Balloon Payment'
      ? Number(deal.principal)
      : (installment ? installment.balance + installment.principal : 0);
    const totalInvested = investmentsSnapshot.docs.reduce((sum, item) => sum + Number(item.data().amount), 0);
    if (totalInvested <= 0) throw new Error('No valid investments found for this deal.');
    for (const investmentSnapshot of investmentsSnapshot.docs) {
      const investment = investmentSnapshot.data();
      const proportion = Number(investment.amount) / totalInvested;
      if (finalInterest > 0) trx.set(adminDb.collection('transactions').doc(), {
        userId: investment.investorId, dealId: deal.id, type: 'ProfitDistribution', amount: finalInterest * proportion * 0.4,
        createdAt: now, dealName: deal.dealName, details: 'Final profit on early termination', sourceRequestId: data.requestId,
      });
      const principal = remainingPrincipal * proportion;
      if (principal > 0) trx.set(adminDb.collection('fundBatches').doc(), {
        sourceId: investment.investorId, amount: principal, remainingAmount: principal, createdAt: now,
        tenureValue: 10, tenureUnit: 'Years', specialInvestment: Boolean(investment.specialInvestment), sourceRequestId: data.requestId,
      });
    }
    const platformProfit = finalInterest * 0.6;
    if (platformProfit > 0) {
      trx.set(adminDb.collection('transactions').doc(), {
        userId: 'platform', dealId: deal.id, type: 'PlatformEarning', amount: platformProfit, createdAt: now,
        dealName: deal.dealName, ownerAllocatable: true, platformEarningKind: 'Operating', sourceRequestId: data.requestId,
      });
      trx.set(adminDb.collection('fundBatches').doc(), {
        sourceId: 'platform', amount: platformProfit, remainingAmount: platformProfit, createdAt: now,
        tenureValue: 10, tenureUnit: 'Years', sourceRequestId: data.requestId,
      });
    }
    repaymentsSnapshot.docs.forEach((snapshot) => trx.update(snapshot.ref, { status: 'Cancelled' }));
    trx.update(dealRef, { status: 'Terminated' });
    trx.update(requestRef, { status: 'Approved', processedAt: now, platformEarning: platformProfit });
  });
  if (data.decision === 'Approved') await processOwnerProfitAllocations({ includeHistorical: false, limit: 200 });
  return { success: true, message: `Termination request ${data.decision.toLowerCase()}.` };
}
