
import { add, differenceInCalendarMonths, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal } from './types';

export interface ScheduleInstallment {
  installment: number;
  dueDate: Date;
  payment: number;
  principal: number;
  interest: number; // Profit or markup for the installment.
  balance: number;
}

export type RepaymentRecord = {
  amount?: number;
  installmentNumber?: number;
  principalApplied?: number;
  interestApplied?: number;
};

function toKobo(value: number): number {
  return Math.round(Number(value || 0) * 100);
}

type RepaymentTerms = Pick<Deal, 'durationValue' | 'durationUnit' | 'repaymentFrequency'>;

function getPeriodsForTerms(termStartDate: Date | undefined, terms: RepaymentTerms, fixedEndDate?: Date): { totalPeriods: number; addPeriod: (date: Date, count: number) => Date } {
  if (!termStartDate) {
      return { totalPeriods: 0, addPeriod: (date, count) => add(date, { days: count }) };
  }

  let totalPeriods = 0;
  let addPeriod: (date: Date, count: number) => Date;

  const endDate = fixedEndDate || (() => {
    switch (terms.durationUnit) {
      case 'Days': return add(termStartDate, { days: terms.durationValue });
      case 'Weeks': return add(termStartDate, { weeks: terms.durationValue });
      case 'Fortnights': return add(termStartDate, { weeks: terms.durationValue * 2 });
      case 'Months': return add(termStartDate, { months: terms.durationValue });
      case 'Years': return add(termStartDate, { years: terms.durationValue });
      default: return termStartDate;
    }
  })();

  switch (terms.repaymentFrequency) {
    case 'Daily':
      totalPeriods = differenceInDays(endDate, termStartDate);
      addPeriod = (date, count) => add(date, { days: count });
      break;
    case 'Weekly':
      totalPeriods = differenceInWeeks(endDate, termStartDate);
      addPeriod = (date, count) => add(date, { weeks: count });
      break;
    case 'Fortnightly':
      totalPeriods = Math.floor(differenceInWeeks(endDate, termStartDate) / 2);
      addPeriod = (date, count) => add(date, { weeks: count * 2 });
      break;
    case 'Monthly':
      totalPeriods = differenceInCalendarMonths(endDate, termStartDate);
       if (totalPeriods === 0) { // Handle cases where duration is less than a month
          totalPeriods = Math.floor(differenceInDays(endDate, termStartDate) / 30);
      }
      addPeriod = (date, count) => add(date, { months: count });
      break;
    default:
      totalPeriods = differenceInCalendarMonths(endDate, termStartDate);
      addPeriod = (date, count) => add(date, { months: count });
      break;
  }
  return { totalPeriods: Math.max(1, totalPeriods), addPeriod };
}

function getPeriods(deal: Deal): { totalPeriods: number; addPeriod: (date: Date, count: number) => Date } {
  return getPeriodsForTerms(deal.startDate?.toDate() || deal.createdAt?.toDate(), deal);
}

export function generateUniformRepaymentSegment(input: {
  principal: number;
  profit: number;
  startDate: Date;
  durationValue: number;
  durationUnit: Deal['durationUnit'];
  repaymentFrequency: Deal['repaymentFrequency'];
  startingInstallment?: number;
  endDate?: Date;
}): ScheduleInstallment[] {
  const principalInKobo = toKobo(input.principal);
  const profitInKobo = toKobo(input.profit);
  if (principalInKobo + profitInKobo <= 0) return [];
  const { totalPeriods, addPeriod } = getPeriodsForTerms(input.startDate, input, input.endDate);
  const principalPerPeriod = Math.floor(principalInKobo / totalPeriods);
  const profitPerPeriod = Math.floor(profitInKobo / totalPeriods);
  const principalRemainder = principalInKobo % totalPeriods;
  const profitRemainder = profitInKobo % totalPeriods;
  let allocatedPrincipal = 0;
  return Array.from({ length: totalPeriods }, (_, index) => {
    const principal = principalPerPeriod + (index < principalRemainder ? 1 : 0);
    const profit = profitPerPeriod + (index < profitRemainder ? 1 : 0);
    allocatedPrincipal += principal;
    return {
      installment: (input.startingInstallment || 1) + index,
      dueDate: addPeriod(input.startDate, index + 1),
      payment: (principal + profit) / 100,
      principal: principal / 100,
      interest: profit / 100,
      balance: (principalInKobo - allocatedPrincipal) / 100,
    };
  });
}

export type RestructuredRepaymentPlan = {
  preservedInstallments: ScheduleInstallment[];
  futureSegment: Parameters<typeof generateUniformRepaymentSegment>[0];
};

function materializeRepaymentPlan(plan: RestructuredRepaymentPlan): ScheduleInstallment[] {
  const replacement = generateUniformRepaymentSegment(plan.futureSegment);
  let remainingPrincipal = [...plan.preservedInstallments, ...replacement]
    .reduce((sum, installment) => sum + toKobo(installment.principal), 0);
  return [...plan.preservedInstallments, ...replacement]
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())
    .map((installment) => {
      remainingPrincipal -= toKobo(installment.principal);
      return { ...installment, balance: Math.max(0, remainingPrincipal) / 100 };
    });
}

export function createRestructuredRepaymentPlan(input: {
  deal: Deal;
  approvedInstallmentNumbers: number[];
  newDurationValue: number;
  newDurationUnit: Deal['durationUnit'];
  newRepaymentFrequency: Deal['repaymentFrequency'];
  effectiveDate: Date;
  maturityDate?: Date;
}): RestructuredRepaymentPlan {
  const currentSchedule = generateAmortizationSchedule(input.deal);
  const approved = new Set(input.approvedInstallmentNumbers);
  const preserved = currentSchedule.filter((installment) => approved.has(installment.installment));
  const totalPrincipal = currentSchedule.reduce((sum, installment) => sum + toKobo(installment.principal), 0);
  const totalProfit = currentSchedule.reduce((sum, installment) => sum + toKobo(installment.interest), 0);
  const preservedPrincipal = preserved.reduce((sum, installment) => sum + toKobo(installment.principal), 0);
  const preservedProfit = preserved.reduce((sum, installment) => sum + toKobo(installment.interest), 0);
  const latestPreservedDueDate = preserved.reduce(
    (latest, installment) => installment.dueDate > latest ? installment.dueDate : latest,
    input.effectiveDate
  );
  const nextInstallment = preserved.length
    ? Math.max(...currentSchedule.map((installment) => installment.installment)) + 1
    : 1;
  return {
    preservedInstallments: preserved,
    futureSegment: {
      principal: (totalPrincipal - preservedPrincipal) / 100,
      profit: (totalProfit - preservedProfit) / 100,
      startDate: latestPreservedDueDate,
      durationValue: input.newDurationValue,
      durationUnit: input.newDurationUnit,
      repaymentFrequency: input.newRepaymentFrequency,
      startingInstallment: nextInstallment,
      ...(input.maturityDate ? { endDate: input.maturityDate } : {}),
    },
  };
}

export function buildRestructuredRepaymentSchedule(input: Parameters<typeof createRestructuredRepaymentPlan>[0]): ScheduleInstallment[] {
  return materializeRepaymentPlan(createRestructuredRepaymentPlan(input));
}


export function generateAmortizationSchedule(deal: Deal): ScheduleInstallment[] {
  if (deal.repaymentPlanOverride) {
    const { startDate, endDate, ...futureTerms } = deal.repaymentPlanOverride.futureSegment;
    return materializeRepaymentPlan({
      preservedInstallments: deal.repaymentPlanOverride.preservedInstallments.map((installment) => ({
        ...installment,
        dueDate: installment.dueDate.toDate(),
      })),
      futureSegment: {
        ...futureTerms,
        startDate: startDate.toDate(),
        ...(endDate
          ? { endDate: endDate.toDate() }
          : {}),
      },
    });
  }
  if (Array.isArray(deal.repaymentScheduleOverride) && deal.repaymentScheduleOverride.length > 0) {
    return deal.repaymentScheduleOverride
      .map((installment) => ({
        installment: Number(installment.installment),
        dueDate: installment.dueDate.toDate(),
        payment: Number(installment.payment),
        principal: Number(installment.principal),
        interest: Number(installment.interest),
        balance: Number(installment.balance),
      }))
      .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
  }
  const termStartDate = deal.startDate?.toDate() || deal.createdAt?.toDate();
  if (!termStartDate) return [];

  const principalInKobo = toKobo(deal.principal);
  const markupRate = (deal.profitRate || 0) / 100;
  
  const { totalPeriods, addPeriod } = getPeriods(deal);

  if (totalPeriods <= 0) return [];

  const schedule: ScheduleInstallment[] = [];
  const totalProfitInKobo = Math.round(principalInKobo * markupRate);
  const principalPerPeriodInKobo = Math.floor(principalInKobo / totalPeriods);
  const profitPerPeriodInKobo = Math.floor(totalProfitInKobo / totalPeriods);
  const principalRemainderInKobo = principalInKobo % totalPeriods;
  const profitRemainderInKobo = totalProfitInKobo % totalPeriods;
  let principalAllocatedInKobo = 0;

  for (let i = 1; i <= totalPeriods; i++) {
    const principalPaymentInKobo =
      principalPerPeriodInKobo + (i <= principalRemainderInKobo ? 1 : 0);
    const profitPaymentInKobo =
      profitPerPeriodInKobo + (i <= profitRemainderInKobo ? 1 : 0);

    principalAllocatedInKobo += principalPaymentInKobo;

    schedule.push({
      installment: i,
      dueDate: addPeriod(termStartDate, i),
      payment: (principalPaymentInKobo + profitPaymentInKobo) / 100,
      principal: principalPaymentInKobo / 100,
      interest: profitPaymentInKobo / 100,
      balance: (principalInKobo - principalAllocatedInKobo) / 100,
    });
  }

  return schedule;
}

export function calculateRemainingRepaymentBalance(
  deal: Deal,
  approvedRepayments: RepaymentRecord[]
) {
  const schedule = generateAmortizationSchedule(deal);
  const scheduledPrincipalInKobo = schedule.reduce((sum, installment) => sum + toKobo(installment.principal), 0);
  const scheduledProfitInKobo = schedule.reduce((sum, installment) => sum + toKobo(installment.interest), 0);

  let paidPrincipalInKobo = 0;
  let paidProfitInKobo = 0;

  for (const repayment of approvedRepayments) {
    const recordedPrincipal = Number(repayment.principalApplied);
    const recordedProfit = Number(repayment.interestApplied);
    if (Number.isFinite(recordedPrincipal) && Number.isFinite(recordedProfit)) {
      paidPrincipalInKobo += toKobo(recordedPrincipal);
      paidProfitInKobo += toKobo(recordedProfit);
      continue;
    }

    const installment = schedule.find((item) => item.installment === Number(repayment.installmentNumber));
    const amountInKobo = toKobo(Number(repayment.amount || 0));
    if (!installment || amountInKobo <= 0) continue;

    const installmentPaymentInKobo = toKobo(installment.payment);
    const principalInKobo = Math.min(
      toKobo(installment.principal),
      Math.round(amountInKobo * (toKobo(installment.principal) / installmentPaymentInKobo))
    );
    paidPrincipalInKobo += principalInKobo;
    paidProfitInKobo += amountInKobo - principalInKobo;
  }

  const remainingPrincipalInKobo = Math.max(0, scheduledPrincipalInKobo - paidPrincipalInKobo);
  const remainingProfitInKobo = Math.max(0, scheduledProfitInKobo - paidProfitInKobo);

  return {
    remainingPrincipal: remainingPrincipalInKobo / 100,
    remainingProfit: remainingProfitInKobo / 100,
    totalRemaining: (remainingPrincipalInKobo + remainingProfitInKobo) / 100,
  };
}
