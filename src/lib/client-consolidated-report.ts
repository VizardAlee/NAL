import { generateAmortizationSchedule } from '@/lib/amortization';
import { repaymentAmountForInstallment } from '@/lib/repayment-allocation';
import { calculateRepaymentProgress } from '@/lib/repayment-progress';
import type { Deal, Repayment } from '@/lib/types';

export type ActiveDealReportRow = {
  dealId: string;
  dealName: string;
  repaymentFrequency: Deal['repaymentFrequency'];
  principal: number;
  totalScheduled: number;
  confirmed: number;
  pending: number;
  outstanding: number;
  progressPercent: number;
  overdueAmount: number;
  overdueInstallments: number;
  nextPayment: { amount: number; dueDate: Date } | null;
};

export type ClientConsolidatedReport = {
  activeDealCount: number;
  activePrincipal: number;
  totalScheduled: number;
  confirmed: number;
  pending: number;
  outstanding: number;
  overdueAmount: number;
  overdueInstallments: number;
  progressPercent: number;
  nextPayment: { dealId: string; dealName: string; amount: number; dueDate: Date } | null;
  deals: ActiveDealReportRow[];
};

const toKobo = (value: number | undefined) => Math.round(Number(value || 0) * 100);
const fromKobo = (value: number) => value / 100;

export function buildClientConsolidatedReport(
  deals: Deal[] | null | undefined,
  repayments: Repayment[] | null | undefined,
  now = new Date()
): ClientConsolidatedReport {
  const activeDeals = (deals || []).filter((deal) => deal.status === 'Active');

  const rows = activeDeals.map((deal): ActiveDealReportRow => {
    const schedule = generateAmortizationSchedule(deal);
    const dealRepayments = (repayments || []).filter((repayment) => repayment.dealId === deal.id);
    const progress = calculateRepaymentProgress(deal.repaymentFrequency, schedule, dealRepayments);
    let overdueKobo = 0;
    let overdueInstallments = 0;
    let nextPayment: ActiveDealReportRow['nextPayment'] = null;

    for (const installment of schedule) {
      const approvedKobo = dealRepayments
        .filter((repayment) => repayment.status === 'Approved')
        .reduce(
          (sum, repayment) => sum + toKobo(repaymentAmountForInstallment(repayment, installment.installment)),
          0
        );
      const pendingKobo = dealRepayments
        .filter((repayment) => repayment.status === 'Pending')
        .reduce(
          (sum, repayment) => sum + toKobo(repaymentAmountForInstallment(repayment, installment.installment)),
          0
        );
      const operationallyUncoveredKobo = Math.max(
        0,
        toKobo(installment.payment) - approvedKobo - pendingKobo
      );

      if (operationallyUncoveredKobo <= 1) continue;
      if (installment.dueDate < now) {
        overdueKobo += operationallyUncoveredKobo;
        overdueInstallments += 1;
      } else if (!nextPayment || installment.dueDate < nextPayment.dueDate) {
        nextPayment = {
          amount: fromKobo(operationallyUncoveredKobo),
          dueDate: installment.dueDate,
        };
      }
    }

    return {
      dealId: deal.id,
      dealName: deal.dealName,
      repaymentFrequency: deal.repaymentFrequency,
      principal: Number(deal.principal || 0),
      totalScheduled: progress.totalScheduled,
      confirmed: progress.totalApproved,
      pending: progress.totalPending,
      outstanding: progress.totalRemaining,
      progressPercent: progress.progressPercent,
      overdueAmount: fromKobo(overdueKobo),
      overdueInstallments,
      nextPayment,
    };
  });

  const totalScheduledKobo = rows.reduce((sum, row) => sum + toKobo(row.totalScheduled), 0);
  const confirmedKobo = rows.reduce((sum, row) => sum + toKobo(row.confirmed), 0);
  const pendingKobo = rows.reduce((sum, row) => sum + toKobo(row.pending), 0);
  const outstandingKobo = rows.reduce((sum, row) => sum + toKobo(row.outstanding), 0);
  const overdueKobo = rows.reduce((sum, row) => sum + toKobo(row.overdueAmount), 0);
  const nextPayment = rows.reduce<ClientConsolidatedReport['nextPayment']>((earliest, row) => {
    if (!row.nextPayment) return earliest;
    const candidate = { dealId: row.dealId, dealName: row.dealName, ...row.nextPayment };
    return !earliest || candidate.dueDate < earliest.dueDate ? candidate : earliest;
  }, null);

  return {
    activeDealCount: rows.length,
    activePrincipal: fromKobo(rows.reduce((sum, row) => sum + toKobo(row.principal), 0)),
    totalScheduled: fromKobo(totalScheduledKobo),
    confirmed: fromKobo(confirmedKobo),
    pending: fromKobo(pendingKobo),
    outstanding: fromKobo(outstandingKobo),
    overdueAmount: fromKobo(overdueKobo),
    overdueInstallments: rows.reduce((sum, row) => sum + row.overdueInstallments, 0),
    progressPercent: totalScheduledKobo > 0
      ? Math.min(100, (confirmedKobo / totalScheduledKobo) * 100)
      : 0,
    nextPayment,
    deals: rows,
  };
}
