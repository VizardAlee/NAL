
import { add, differenceInCalendarMonths, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal } from './types';

export interface ScheduleInstallment {
  installment: number;
  dueDate: Date;
  payment: number;
  principal: number;
  interest: number; // This will now represent "profit" or "markup"
  balance: number;
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

  const principal = deal.principal;
  const markupRate = (deal.profitRate || 0) / 100;
  const { totalPeriods, addPeriod } = getPeriods(deal);

  if (totalPeriods === 0) return [];
  
  const schedule: ScheduleInstallment[] = [];

  if (deal.repaymentType === 'Balloon Payment') {
    const totalProfit = principal * markupRate;
    const profitPerInstallment = totalPeriods > 0 ? totalProfit / totalPeriods : 0;

    for (let i = 1; i <= totalPeriods; i++) {
        const isLastPayment = i === totalPeriods;
        const principalPayment = isLastPayment ? principal : 0;
        const payment = profitPerInstallment + principalPayment;
        const balance = isLastPayment ? 0 : principal;
        
        schedule.push({
            installment: i,
            dueDate: addPeriod(termStartDate, i),
            payment: payment,
            principal: principalPayment,
            interest: profitPerInstallment,
            balance: balance,
        });
    }

  } else { // Equal Installments
      const totalProfit = principal * markupRate;
      const totalRepayment = principal + totalProfit;
      const equalPayment = totalPeriods > 0 ? totalRepayment / totalPeriods : 0;
      
      // To create an amortized effect, we need an effective periodic rate that, when applied,
      // results in the desired total profit. This requires solving for the rate.
      // A common approximation for this is the "Rule of 78s" or simply calculating
      // an effective rate. Let's find a rate 'r' such that the sum of interest payments equals totalProfit.
      // This is a complex calculation, so a more direct method is to use a financial formula to find
      // the rate that produces the `equalPayment`.
      // Let's solve for the monthly rate `r`. P = L[r(1+r)^n]/[(1+r)^n-1]
      // We can't solve for r algebraically, but we can iterate or use a simpler apportionment logic.

      // A simpler, more direct logic: Sum of Digits Method (Rule of 78s).
      const sumOfDigits = (totalPeriods * (totalPeriods + 1)) / 2;
      let remainingBalance = principal;
      let remainingProfit = totalProfit;

      for (let i = 1; i <= totalPeriods; i++) {
          const profitProportion = (totalPeriods - i + 1) / sumOfDigits;
          const profitPayment = totalProfit * profitProportion;
          const principalPayment = equalPayment - profitPayment;
          
          remainingBalance -= principalPayment;
          remainingProfit -= profitPayment;

          if (i === totalPeriods) {
            // Adjust the final payment to clear any rounding discrepancies
            const finalPrincipalPayment = principalPayment + remainingBalance;
            schedule.push({
              installment: i,
              dueDate: addPeriod(termStartDate, i),
              payment: finalPrincipalPayment + profitPayment,
              principal: finalPrincipalPayment,
              interest: profitPayment,
              balance: 0,
            });
          } else {
            schedule.push({
              installment: i,
              dueDate: addPeriod(termStartDate, i),
              payment: equalPayment,
              principal: principalPayment,
              interest: profitPayment,
              balance: remainingBalance,
            });
          }
      }
  }

  return schedule;
}
