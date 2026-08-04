'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { verifyAdminWrite } from '@/lib/server/auth';
import { calculateRemainingRepaymentBalance, generateAmortizationSchedule } from '@/lib/amortization';
import { processOwnerProfitAllocations } from '@/lib/server/owner-profit';
import {
  allocateCurrencyByWeights,
  allocatePartialRepayment,
  calculateAvailableProfit,
  roundCurrency,
} from '@/lib/financial-integrity';
import { loadFundBatchAnniversaryWindow } from '@/lib/server/fund-batch-anniversary';

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
      createdAt: now,
      tenureValue: Number(request.tenureValue || 36),
      tenureUnit: request.tenureUnit || 'Months',
      paymentDate: request.paymentDate || now,
      paymentReference: request.paymentReference || `NAL-DEP-${data.requestId.toUpperCase()}`,
      specialInvestment: data.specialInvestment,
      sourceRequestId: data.requestId,
    });
    trx.set(adminDb.collection('transactions').doc(), {
      userId: request.investorId, type: 'Deposit', amount: request.amount, createdAt: now,
      details: 'Investor Deposit', sourceRequestId: data.requestId,
      paymentReference: request.paymentReference || `NAL-DEP-${data.requestId.toUpperCase()}`,
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
    const [anniversaryContext, requestsSnapshot] = data.decision === 'Approved'
      ? await Promise.all([
          loadFundBatchAnniversaryWindow(trx, request.investorId),
          trx.get(adminDb.collection('reinvestmentRequests').where('investorId', '==', request.investorId)),
        ])
      : [null, null];
    trx.update(requestRef, { status: data.decision, processedAt: FieldValue.serverTimestamp() });
    if (data.decision === 'Rejected') return;
    const otherReserved = requestsSnapshot!.docs
      .filter((doc) => doc.id !== data.requestId && doc.data().status === 'Pending')
      .reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0);
    const availableProfit = calculateAvailableProfit(
      anniversaryContext!.entries,
      otherReserved + anniversaryContext!.window.reinvestmentReserve
    );
    if (Number(request.amount) > availableProfit + 0.01) {
      throw new Error('Insufficient available profit for this reinvestment.');
    }
    const now = Timestamp.now();
    for (const tx of [
      { type: 'Withdrawal', amount: -request.amount, metadata: { source: 'ProfitReinvestment' } },
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
    const isOwnerWithdrawal = request.type === 'OwnerWithdrawal';
    let eligibleBatchesQuery = adminDb.collection('fundBatches')
      .where('sourceId', '==', userId)
      .where('remainingAmount', '>', 0);
    if (isOwnerWithdrawal) {
      eligibleBatchesQuery = eligibleBatchesQuery.where('sourceType', '==', 'OwnerProfitAutoAllocation');
    }
    const batchesSnapshot = data.decision === 'Approved'
      ? await trx.get(eligibleBatchesQuery.orderBy('createdAt', 'asc'))
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
      ...(isOwnerWithdrawal ? { sourceType: 'OwnerProfitWithdrawal' } : {}),
      ...(request.source ? { metadata: { source: request.source } } : {}),
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
    const [dealSnapshot, investmentsSnapshot, approvedRepaymentsSnapshot] = await Promise.all([
      trx.get(dealRef),
      trx.get(adminDb.collection('investments').where('dealId', '==', repayment.dealId)),
      trx.get(
        adminDb.collection('repayments')
          .where('dealId', '==', repayment.dealId)
          .where('installmentNumber', '==', repayment.installmentNumber || 1)
          .where('status', '==', 'Approved')
      ),
    ]);
    if (!dealSnapshot.exists) throw new Error('Associated deal not found.');
    if (investmentsSnapshot.empty) throw new Error('No investors found for this deal.');
    const sourceBatchSnapshots = await Promise.all(investmentsSnapshot.docs.map((snapshot) => {
      const fundBatchId = snapshot.data().fundBatchId;
      return fundBatchId ? trx.get(adminDb.collection('fundBatches').doc(fundBatchId)) : Promise.resolve(null);
    }));
    const deal = { id: dealSnapshot.id, ...dealSnapshot.data() } as any;
    const installment = generateAmortizationSchedule(deal).find((item) => item.installment === (repayment.installmentNumber || 1));
    if (!installment) throw new Error('Matching repayment installment was not found.');
    const repaymentAmount = roundCurrency(Number(repayment.amount));
    const alreadyApproved = roundCurrency(approvedRepaymentsSnapshot.docs.reduce(
      (sum, item) => sum + Number(item.data().amount || 0),
      0
    ));
    if (!Number.isFinite(repaymentAmount) || repaymentAmount <= 0) throw new Error('Repayment amount is invalid.');
    if (roundCurrency(alreadyApproved + repaymentAmount) > installment.payment) {
      throw new Error('Approving this repayment would exceed the scheduled installment.');
    }
    const allocation = allocatePartialRepayment(repaymentAmount, installment);
    const totalInvested = investmentsSnapshot.docs.reduce((sum, item) => sum + Number(item.data().amount), 0);
    if (!Number.isFinite(totalInvested) || totalInvested <= 0) throw new Error('Investment total is invalid.');
    const investments = investmentsSnapshot.docs.map((snapshot, index) => ({
      snapshot,
      data: {
        ...snapshot.data(),
        sourceType: snapshot.data().sourceType || sourceBatchSnapshots[index]?.data()?.sourceType,
      } as any,
      weight: Number(snapshot.data().amount),
    }));
    const investorProfitPool = roundCurrency(allocation.interest * 0.4);
    const investorProfitShares = allocateCurrencyByWeights(
      investorProfitPool,
      investments.map((investment) => investment.weight)
    );
    const principalShares = allocateCurrencyByWeights(
      allocation.principal,
      investments.map((investment) => investment.weight)
    );
    const now = Timestamp.now();
    for (const [index, item] of investments.entries()) {
      const investmentSnapshot = item.snapshot;
      const investment = item.data;
      const investorProfit = investorProfitShares[index];
      const principalReturned = principalShares[index];
      trx.set(adminDb.collection('transactions').doc(), {
        userId: investment.investorId, dealId: repayment.dealId, type: 'ProfitDistribution', amount: investorProfit,
        createdAt: now, dealName: deal.dealName, sourceRequestId: data.requestId,
        investmentId: investmentSnapshot.id,
        ...(investment.fundBatchId ? { fundBatchId: investment.fundBatchId } : {}),
      });
      if (principalReturned > 0) trx.set(adminDb.collection('fundBatches').doc(), {
        sourceId: investment.investorId, amount: principalReturned, remainingAmount: principalReturned,
        createdAt: now, tenureValue: 0, tenureUnit: 'Days', specialInvestment: Boolean(investment.specialInvestment), sourceRequestId: data.requestId,
        ...(investment.sourceType === 'OwnerProfitAutoAllocation' ? { sourceType: investment.sourceType } : {}),
      });
    }
    const platformProfit = roundCurrency(allocation.interest - investorProfitPool);
    trx.set(adminDb.collection('transactions').doc(), {
      userId: 'platform', dealId: repayment.dealId, type: 'PlatformEarning', amount: platformProfit,
      createdAt: now, dealName: deal.dealName, ownerAllocatable: true, ownerAllocationId: null,
      platformEarningKind: 'Operating', sourceRequestId: data.requestId,
    });
    trx.set(adminDb.collection('fundBatches').doc(), {
      sourceId: 'platform', amount: platformProfit, remainingAmount: platformProfit, createdAt: now,
      tenureValue: 10, tenureUnit: 'Years', sourceRequestId: data.requestId,
    });
    trx.set(adminDb.collection('transactions').doc(), {
      userId: repayment.clientId, dealId: repayment.dealId, type: 'Repayment', amount: -repaymentAmount,
      createdAt: now, dealName: deal.dealName, sourceRequestId: data.requestId,
    });
    trx.update(repaymentRef, {
      status: 'Approved',
      approvedAt: now,
      principalApplied: allocation.principal,
      interestApplied: allocation.interest,
    });
  });
  if (data.decision === 'Approved') await processOwnerProfitAllocations({ includeHistorical: false, limit: 200 });
  return { success: true, message: `Repayment ${data.decision.toLowerCase()}.` };
}

export async function processTerminationRequestAction(input: Omit<DecisionInput, 'specialInvestment'>) {
  const data = parseDecision({ ...input, specialInvestment: false });
  await verifyAdminWrite(data.authToken);
  let confirmedSettlementAmount: number | null = null;
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
      trx.get(adminDb.collection('repayments').where('dealId', '==', request.dealId)),
    ]);
    if (!dealSnapshot.exists) throw new Error('Deal not found.');
    const sourceBatchSnapshots = await Promise.all(investmentsSnapshot.docs.map((snapshot) => {
      const fundBatchId = snapshot.data().fundBatchId;
      return fundBatchId ? trx.get(adminDb.collection('fundBatches').doc(fundBatchId)) : Promise.resolve(null);
    }));
    const deal = { id: dealSnapshot.id, ...dealSnapshot.data() } as any;
    if (deal.status === 'Terminated') throw new Error('Deal is already terminated.');
    const now = Timestamp.now();
    const approvedRepayments = repaymentsSnapshot.docs
      .map((snapshot) => snapshot.data())
      .filter((repayment) => repayment.status === 'Approved');
    const settlement = calculateRemainingRepaymentBalance(deal, approvedRepayments);
    if (settlement.totalRemaining <= 0) throw new Error('This deal has no remaining balance to settle.');
    confirmedSettlementAmount = settlement.totalRemaining;
    const totalInvested = investmentsSnapshot.docs.reduce((sum, item) => sum + Number(item.data().amount), 0);
    if (totalInvested <= 0) throw new Error('No valid investments found for this deal.');
    const investments = investmentsSnapshot.docs.map((snapshot, index) => ({
      snapshot,
      data: {
        ...snapshot.data(),
        sourceType: snapshot.data().sourceType || sourceBatchSnapshots[index]?.data()?.sourceType,
      } as any,
      weight: Number(snapshot.data().amount),
    }));
    const investorProfitPool = roundCurrency(settlement.remainingProfit * 0.4);
    const investorProfitShares = allocateCurrencyByWeights(
      investorProfitPool,
      investments.map((investment) => investment.weight)
    );
    const principalShares = allocateCurrencyByWeights(
      settlement.remainingPrincipal,
      investments.map((investment) => investment.weight)
    );
    for (const [index, item] of investments.entries()) {
      const investmentSnapshot = item.snapshot;
      const investment = item.data;
      const investorProfit = investorProfitShares[index];
      if (investorProfit > 0) trx.set(adminDb.collection('transactions').doc(), {
        userId: investment.investorId, dealId: deal.id, type: 'ProfitDistribution', amount: investorProfit,
        createdAt: now, dealName: deal.dealName, details: 'Remaining profit paid on termination', sourceRequestId: data.requestId,
        investmentId: investmentSnapshot.id,
        ...(investment.fundBatchId ? { fundBatchId: investment.fundBatchId } : {}),
      });
      const principal = principalShares[index];
      if (principal > 0) trx.set(adminDb.collection('fundBatches').doc(), {
        sourceId: investment.investorId, amount: principal, remainingAmount: principal, createdAt: now,
        tenureValue: 10, tenureUnit: 'Years', specialInvestment: Boolean(investment.specialInvestment), sourceRequestId: data.requestId,
        ...(investment.sourceType === 'OwnerProfitAutoAllocation' ? { sourceType: investment.sourceType } : {}),
      });
    }
    const platformProfit = roundCurrency(settlement.remainingProfit - investorProfitPool);
    if (platformProfit > 0) {
      trx.set(adminDb.collection('transactions').doc(), {
        userId: 'platform', dealId: deal.id, type: 'PlatformEarning', amount: platformProfit, createdAt: now,
        dealName: deal.dealName, ownerAllocatable: true, ownerAllocationId: null,
        platformEarningKind: 'Operating', sourceRequestId: data.requestId,
      });
      trx.set(adminDb.collection('fundBatches').doc(), {
        sourceId: 'platform', amount: platformProfit, remainingAmount: platformProfit, createdAt: now,
        tenureValue: 10, tenureUnit: 'Years', sourceRequestId: data.requestId,
      });
    }
    for (const snapshot of repaymentsSnapshot.docs) {
      if (snapshot.data().status === 'Pending') {
        trx.update(snapshot.ref, { status: 'Cancelled', processedAt: now });
      }
    }
    trx.set(adminDb.collection('repayments').doc(), {
      dealId: deal.id,
      clientId: deal.clientId,
      amount: settlement.totalRemaining,
      status: 'Approved',
      lodgedAt: now,
      approvedAt: now,
      dueDate: now,
      installmentNumber: 0,
      principalApplied: settlement.remainingPrincipal,
      interestApplied: settlement.remainingProfit,
      isTerminationSettlement: true,
      sourceRequestId: data.requestId,
    });
    trx.set(adminDb.collection('transactions').doc(), {
      userId: deal.clientId,
      dealId: deal.id,
      type: 'Repayment',
      amount: -settlement.totalRemaining,
      createdAt: now,
      dealName: deal.dealName,
      details: 'Full remaining balance paid on termination',
      sourceRequestId: data.requestId,
    });
    trx.update(dealRef, {
      status: 'Terminated',
      terminatedAt: now,
      terminationSettlementAmount: settlement.totalRemaining,
    });
    trx.update(requestRef, {
      status: 'Approved',
      processedAt: now,
      remainingPrincipal: settlement.remainingPrincipal,
      remainingProfit: settlement.remainingProfit,
      settlementAmount: settlement.totalRemaining,
      platformEarning: platformProfit,
    });
  });
  if (data.decision === 'Approved') await processOwnerProfitAllocations({ includeHistorical: false, limit: 200 });
  const message = data.decision === 'Approved' && confirmedSettlementAmount !== null
    ? `Full settlement of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(confirmedSettlementAmount)} confirmed and deal terminated.`
    : 'Termination request rejected.';
  return { success: true, message };
}
