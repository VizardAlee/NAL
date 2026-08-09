import type { ScheduleInstallment } from '@/lib/amortization';
import { repaymentAmountForInstallment, type RepaymentAllocation } from '@/lib/repayment-allocation';

export type RepaymentStatementStatus = 'Paid' | 'Awaiting approval' | 'Part-paid' | 'Due' | 'Upcoming';

type StatementRepayment = {
  installmentNumber?: number;
  amount?: number;
  status?: string;
  allocations?: RepaymentAllocation[];
};

const toKobo = (value: number) => Math.round(Number(value || 0) * 100);

export function buildRepaymentStatementRows(
  schedule: ScheduleInstallment[],
  repayments: StatementRepayment[] | null | undefined,
  now = new Date()
) {
  const totalRepaymentInKobo = schedule.reduce((sum, installment) => sum + toKobo(installment.payment), 0);
  let scheduledInKobo = 0;

  return schedule.map((installment) => {
    const installmentInKobo = toKobo(installment.payment);
    const openingBalance = (totalRepaymentInKobo - scheduledInKobo) / 100;
    scheduledInKobo += installmentInKobo;
    const closingBalance = Math.max(0, totalRepaymentInKobo - scheduledInKobo) / 100;
    const related = (repayments || []).filter((repayment) => repaymentAmountForInstallment(repayment, installment.installment) > 0);
    const approvedInKobo = related
      .filter((repayment) => repayment.status === 'Approved')
      .reduce((sum, repayment) => sum + toKobo(repaymentAmountForInstallment(repayment, installment.installment)), 0);
    const pendingInKobo = related
      .filter((repayment) => repayment.status === 'Pending')
      .reduce((sum, repayment) => sum + toKobo(repaymentAmountForInstallment(repayment, installment.installment)), 0);
    const status: RepaymentStatementStatus = approvedInKobo >= installmentInKobo
      ? 'Paid'
      : pendingInKobo > 0
        ? 'Awaiting approval'
        : approvedInKobo > 0
          ? 'Part-paid'
          : installment.dueDate < now
            ? 'Due'
            : 'Upcoming';

    return { ...installment, openingBalance, closingBalance, status };
  });
}
