
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

function getPeriods(deal: Deal): { totalPeriods: number; addPeriod: (date: Date, count: number) => Date } {
  const termStartDate = deal.startDate?.toDate() || deal.createdAt?.toDate();
  if (!termStartDate) {
      return { totalPeriods: 0, addPeriod: (date, count) => add(date, { days: count }) };
  }

  let totalPeriods = 0;
  let addPeriod: (date: Date, count: number) => Date;

  const durationInDays = (() => {
    switch (deal.durationUnit) {
      case 'Days': return deal.durationValue;
      case 'Weeks': return deal.durationValue * 7;
      case 'Fortnights': return deal.durationValue * 14;
      case 'Months': return deal.durationValue * 30.4375; // Average days in month
      case 'Years': return deal.durationValue * 365.25;
      default: return 0;
    }
  })();

  const endDate = add(termStartDate, { days: Math.round(durationInDays) });

  switch (deal.repaymentFrequency) {
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


export function generateAmortizationSchedule(deal: Deal): ScheduleInstallment[] {
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
