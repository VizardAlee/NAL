import type { ScheduleInstallment } from '@/lib/amortization';
import { roundCurrency } from '@/lib/financial-integrity';

export type RepaymentAllocation = {
  installmentNumber: number;
  amount: number;
  principalApplied: number;
  interestApplied: number;
};

export type AllocationAwareRepayment = {
  amount?: number;
  installmentNumber?: number;
  principalApplied?: number;
  interestApplied?: number;
  allocations?: RepaymentAllocation[];
  status?: string;
};

const toKobo = (value: number) => Math.round(Number(value || 0) * 100);

export function repaymentAmountForInstallment(
  repayment: AllocationAwareRepayment,
  installmentNumber: number
): number {
  if (Array.isArray(repayment.allocations) && repayment.allocations.length > 0) {
    return roundCurrency(repayment.allocations
      .filter((allocation) => Number(allocation.installmentNumber) === installmentNumber)
      .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0));
  }
  return Number(repayment.installmentNumber) === installmentNumber
    ? roundCurrency(Number(repayment.amount || 0))
    : 0;
}

export function repaymentComponentsForInstallment(
  repayment: AllocationAwareRepayment,
  installment: ScheduleInstallment
) {
  const explicit = repayment.allocations?.find(
    (allocation) => Number(allocation.installmentNumber) === installment.installment
  );
  if (explicit) {
    return {
      principal: roundCurrency(Number(explicit.principalApplied || 0)),
      interest: roundCurrency(Number(explicit.interestApplied || 0)),
    };
  }
  if (Number(repayment.installmentNumber) !== installment.installment) {
    return { principal: 0, interest: 0 };
  }
  const amount = roundCurrency(Number(repayment.amount || 0));
  const recordedPrincipal = Number(repayment.principalApplied);
  const recordedInterest = Number(repayment.interestApplied);
  if (Number.isFinite(recordedPrincipal) && Number.isFinite(recordedInterest)) {
    return { principal: roundCurrency(recordedPrincipal), interest: roundCurrency(recordedInterest) };
  }
  const paymentKobo = toKobo(installment.payment);
  if (amount <= 0 || paymentKobo <= 0) return { principal: 0, interest: 0 };
  const principal = Math.min(
    toKobo(installment.principal),
    Math.round(toKobo(amount) * (toKobo(installment.principal) / paymentKobo))
  ) / 100;
  return { principal, interest: roundCurrency(amount - principal) };
}

export function planRepaymentAllocations(input: {
  amount: number;
  startingInstallment: number;
  schedule: ScheduleInstallment[];
  approvedRepayments: AllocationAwareRepayment[];
}): RepaymentAllocation[] {
  let remainingKobo = toKobo(input.amount);
  if (remainingKobo <= 0) throw new Error('Repayment amount must be positive.');
  const allocations: RepaymentAllocation[] = [];

  for (const installment of input.schedule) {
    if (installment.installment < input.startingInstallment || remainingKobo <= 0) continue;
    const applied = input.approvedRepayments.reduce(
      (total, repayment) => {
        const components = repaymentComponentsForInstallment(repayment, installment);
        return {
          principal: total.principal + toKobo(components.principal),
          interest: total.interest + toKobo(components.interest),
        };
      },
      { principal: 0, interest: 0 }
    );
    const principalRemaining = Math.max(0, toKobo(installment.principal) - applied.principal);
    const interestRemaining = Math.max(0, toKobo(installment.interest) - applied.interest);
    const installmentRemaining = principalRemaining + interestRemaining;
    if (installmentRemaining <= 0) continue;

    const allocated = Math.min(remainingKobo, installmentRemaining);
    const principal = allocated === installmentRemaining
      ? principalRemaining
      : Math.min(principalRemaining, Math.round(allocated * (principalRemaining / installmentRemaining)));
    const interest = allocated - principal;
    allocations.push({
      installmentNumber: installment.installment,
      amount: allocated / 100,
      principalApplied: principal / 100,
      interestApplied: interest / 100,
    });
    remainingKobo -= allocated;
  }

  if (remainingKobo > 0) {
    throw new Error('Payment exceeds the remaining deal balance.');
  }
  return allocations;
}

export function remainingScheduledAmount(
  schedule: ScheduleInstallment[],
  repayments: AllocationAwareRepayment[],
  statuses: string[] = ['Approved']
) {
  const used = new Set(statuses);
  const scheduled = schedule.reduce((sum, installment) => sum + toKobo(installment.payment), 0);
  const applied = repayments
    .filter((repayment) => used.has(String(repayment.status || '')))
    .reduce((sum, repayment) => sum + toKobo(Number(repayment.amount || 0)), 0);
  return Math.max(0, scheduled - applied) / 100;
}
