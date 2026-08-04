'use server';

import { AggregateField, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/firebase/admin-app';
import { verifyOwnerRead } from '@/lib/server/auth';
import { assertValidOwnerConfiguration, calculateOwnerBalances } from '@/lib/owner-accounting';

const inputSchema = z.object({ authToken: z.string().min(1) });

export type OwnerDashboardSnapshot = {
  metrics: {
    grossPlatformEarnings: number;
    activeDealsCount: number;
    totalUsers: number;
    adminDebtToPlatform: number;
    globalTotalRetained: number;
    globalTotalDistributed: number;
    personalTotalAllocated: number;
    personalUnwithdrawnProfit: number;
    withdrawableLiquidProfit: number;
    personalInvestible: number;
    personalInvested: number;
    myShareUnits: number;
    mySharePercent: number;
    totalAuthShares: number;
    pendingRepaymentCount: number;
    pendingRepaymentAmount: number;
    overdueCaseCount: number;
    overdueExposure: number;
  };
  policy: { retainedPercent: number; distributablePercent: number };
  withdrawals: Array<{ id: string; amount: number; status: string; requestedAt: string }>;
  allocations: Array<{
    id: string;
    sourceEarningAmount: number;
    retainedAmount: number;
    distributableAmount: number;
    createdAt: string | null;
    retainedPercent: number;
    distributablePercent: number;
  }>;
  withdrawalWindow: { quarters: Array<{ label: string; startDate: string; endDate: string }> };
  generatedAt: string;
};

const number = (value: unknown) => Number(value || 0);
const iso = (value: unknown): string | null => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
};

const isEffectiveNow = (data: DocumentData, nowMs: number) => {
  const from = data.effectiveFrom instanceof Timestamp ? data.effectiveFrom.toMillis() : null;
  const to = data.effectiveTo instanceof Timestamp ? data.effectiveTo.toMillis() : null;
  return (from == null || nowMs >= from) && (to == null || nowMs <= to);
};

export async function loadOwnerDashboardAction(input: { authToken: string }): Promise<
  { success: true; data: OwnerDashboardSnapshot } | { success: false; message: string }
> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: 'Authentication is required.' };

  try {
    const owner = await verifyOwnerRead(parsed.data.authToken);
    const policyRef = adminDb.doc('platformPolicies/ownerProfit');
    const partnerRef = adminDb.doc(`ownershipPartners/${owner.uid}`);
    const windowRef = adminDb.doc('platformSettings/ownerWithdrawalWindow');

    const allocations = adminDb.collection('ownerProfitAllocations').where('status', '==', 'Completed');
    const ownerDeposits = adminDb.collection('transactions')
      .where('userId', '==', owner.uid)
      .where('sourceType', '==', 'OwnerProfitAutoAllocation');
    const approvedOwnerWithdrawals = adminDb.collection('withdrawalRequests')
      .where('investorId', '==', owner.uid)
      .where('type', '==', 'OwnerWithdrawal')
      .where('status', '==', 'Approved');
    const pendingOwnerWithdrawals = adminDb.collection('withdrawalRequests')
      .where('investorId', '==', owner.uid)
      .where('type', '==', 'OwnerWithdrawal')
      .where('status', '==', 'Pending');
    const ownerBatches = adminDb.collection('fundBatches')
      .where('sourceId', '==', owner.uid)
      .where('sourceType', '==', 'OwnerProfitAutoAllocation');
    const pendingRepayments = adminDb.collection('repayments').where('status', '==', 'Pending');
    const overdueCases = adminDb.collection('recoveryTasks')
      .where('status', 'in', ['OVERDUE', 'BROKEN_PROMISE', 'Due_Recovery']);

    const [
      policySnap, partnerSnap, windowSnap, activePartnersSnap,
      allocationTotalsSnap, personalAllocationSnap, approvedWithdrawalSnap, pendingWithdrawalSnap, ownerBatchSnap,
      usersCountSnap, activeDealsSnap, activeLoansSnap, pendingRepaymentsSnap, overdueCasesSnap,
      withdrawalsSnap, recentAllocationsSnap,
    ] = await Promise.all([
      policyRef.get(),
      partnerRef.get(),
      windowRef.get(),
      adminDb.collection('ownershipPartners').where('active', '==', true).get(),
      allocations.aggregate({
        gross: AggregateField.sum('sourceEarningAmount'),
        retained: AggregateField.sum('retainedAmount'),
        distributed: AggregateField.sum('distributableAmount'),
      }).get(),
      ownerDeposits.aggregate({ total: AggregateField.sum('amount') }).get(),
      approvedOwnerWithdrawals.aggregate({ total: AggregateField.sum('amount') }).get(),
      pendingOwnerWithdrawals.aggregate({ total: AggregateField.sum('amount') }).get(),
      ownerBatches.aggregate({ liquid: AggregateField.sum('remainingAmount') }).get(),
      adminDb.collection('users').count().get(),
      adminDb.collection('deals').where('status', '==', 'Active').count().get(),
      adminDb.collection('interAccountLoans').where('status', '==', 'Active')
        .aggregate({ total: AggregateField.sum('outstanding') }).get(),
      pendingRepayments.aggregate({ count: AggregateField.count(), total: AggregateField.sum('amount') }).get(),
      overdueCases.aggregate({ count: AggregateField.count(), total: AggregateField.sum('amountOutstanding') }).get(),
      adminDb.collection('withdrawalRequests').where('investorId', '==', owner.uid)
        .orderBy('requestedAt', 'desc').limit(100).get(),
      allocations.orderBy('createdAt', 'desc').limit(6).get(),
    ]);

    if (!policySnap.exists) throw new Error('Owner profit policy is not configured. Ask an administrator to configure it.');
    if (!partnerSnap.exists) throw new Error('Your ownership partner record is missing. Ask an administrator to configure it.');

    const policy = policySnap.data()!;
    const partner = partnerSnap.data()!;
    const totalShares = number(policy.totalShares);
    const retainedPercent = number(policy.retainedPercent);
    const distributablePercent = number(policy.distributablePercent);
    const nowMs = Date.now();
    const activeShareUnits = activePartnersSnap.docs
      .filter((doc) => isEffectiveNow(doc.data(), nowMs))
      .map((doc) => number(doc.data().shareUnits));
    if (partner.active !== true || !isEffectiveNow(partner, nowMs) || number(partner.shareUnits) <= 0) {
      throw new Error('Your ownership partner record is inactive or invalid. Financial figures have been withheld.');
    }
    assertValidOwnerConfiguration({ totalShares, retainedPercent, distributablePercent, activeShareUnits });

    const allocationTotals = allocationTotalsSnap.data();
    const personalTotalAllocated = number(personalAllocationSnap.data().total);
    const approvedWithdrawals = number(approvedWithdrawalSnap.data().total);
    const pendingWithdrawals = number(pendingWithdrawalSnap.data().total);
    const personalInvestible = number(ownerBatchSnap.data().liquid);
    const balances = calculateOwnerBalances({
      allocated: personalTotalAllocated,
      approvedWithdrawals,
      liquidOwnerFunds: personalInvestible,
      pendingWithdrawals,
    });

    return {
      success: true,
      data: {
        metrics: {
          grossPlatformEarnings: number(allocationTotals.gross),
          activeDealsCount: number(activeDealsSnap.data().count),
          totalUsers: number(usersCountSnap.data().count),
          adminDebtToPlatform: number(activeLoansSnap.data().total),
          globalTotalRetained: number(allocationTotals.retained),
          globalTotalDistributed: number(allocationTotals.distributed),
          personalTotalAllocated,
          personalUnwithdrawnProfit: balances.unwithdrawn,
          withdrawableLiquidProfit: balances.withdrawable,
          personalInvestible,
          personalInvested: balances.invested,
          myShareUnits: number(partner.shareUnits),
          mySharePercent: (number(partner.shareUnits) / totalShares) * 100,
          totalAuthShares: totalShares,
          pendingRepaymentCount: number(pendingRepaymentsSnap.data().count),
          pendingRepaymentAmount: number(pendingRepaymentsSnap.data().total),
          overdueCaseCount: number(overdueCasesSnap.data().count),
          overdueExposure: number(overdueCasesSnap.data().total),
        },
        policy: { retainedPercent, distributablePercent },
        withdrawals: withdrawalsSnap.docs.map((doc) => ({
          id: doc.id,
          amount: number(doc.data().amount),
          status: String(doc.data().status || 'Pending'),
          requestedAt: iso(doc.data().requestedAt) || new Date(0).toISOString(),
        })),
        allocations: recentAllocationsSnap.docs.map((doc) => ({
          id: doc.id,
          sourceEarningAmount: number(doc.data().sourceEarningAmount),
          retainedAmount: number(doc.data().retainedAmount),
          distributableAmount: number(doc.data().distributableAmount),
          createdAt: iso(doc.data().createdAt),
          retainedPercent: number(doc.data().policySnapshot?.retainedPercent),
          distributablePercent: number(doc.data().policySnapshot?.distributablePercent),
        })),
        withdrawalWindow: {
          quarters: Array.isArray(windowSnap.data()?.quarters) ? windowSnap.data()!.quarters : [],
        },
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error: unknown) {
    console.error('Owner dashboard load failed:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Owner dashboard data could not be loaded.' };
  }
}
