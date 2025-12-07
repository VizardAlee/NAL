
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

  } else { // Equal Installments (with flat markup)
      const totalProfit = principal * markupRate;
      const totalRepayment = principal + totalProfit;
      const equalPayment = totalRepayment / totalPeriods;
      
      let remainingBalance = principal;
      let remainingProfit = totalProfit;

      for (let i = 1; i <= totalPeriods; i++) {
        // To mimic amortization, we can calculate this period's profit as a proportion
        // of the remaining balance relative to the sum of balances over the term.
        // A simpler method is to just distribute profit evenly. Let's do that for clarity.
        const profitPayment = totalProfit / totalPeriods;
        const principalPayment = equalPayment - profitPayment;
        
        remainingBalance -= principalPayment;
        remainingProfit -= profitPayment;

        // On the last payment, adjust for any rounding errors to ensure balance is exactly zero.
        if (i === totalPeriods) {
            schedule.push({
              installment: i,
              dueDate: addPeriod(termStartDate, i),
              payment: equalPayment + remainingBalance, // Adjust final payment
              principal: principalPayment + remainingBalance,
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
