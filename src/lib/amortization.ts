
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

  // --- Use Integers for Calculations (Kobo) ---
  const principalInKobo = Math.round(deal.principal * 100);
  const markupRate = (deal.profitRate || 0) / 100;
  
  const { totalPeriods, addPeriod } = getPeriods(deal);

  if (totalPeriods <= 0) return [];

  const schedule: ScheduleInstallment[] = [];
  const totalProfitInKobo = Math.round(principalInKobo * markupRate);
  
  if (deal.repaymentType === 'Balloon Payment') {
    const profitPerInstallmentInKobo = Math.floor(totalProfitInKobo / totalPeriods);
    let accumulatedProfit = 0;

    for (let i = 1; i <= totalPeriods; i++) {
        const isLastPayment = i === totalPeriods;
        let currentProfit = profitPerInstallmentInKobo;
        if (isLastPayment) {
            currentProfit = totalProfitInKobo - accumulatedProfit;
        }
        accumulatedProfit += currentProfit;
        
        const principalPaymentInKobo = isLastPayment ? principalInKobo : 0;
        const paymentInKobo = currentProfit + principalPaymentInKobo;
        const balanceInKobo = isLastPayment ? 0 : principalInKobo;
        
        schedule.push({
            installment: i,
            dueDate: addPeriod(termStartDate, i),
            payment: paymentInKobo / 100,
            principal: principalPaymentInKobo / 100,
            interest: currentProfit / 100,
            balance: balanceInKobo / 100,
        });
    }

  } else { // Equal Installments
      const totalRepaymentInKobo = principalInKobo + totalProfitInKobo;
      const equalPaymentInKobo = Math.floor(totalRepaymentInKobo / totalPeriods);
      
      let remainingBalanceInKobo = principalInKobo;
      let accumulatedPayment = 0;

      const sumOfDigits = (totalPeriods * (totalPeriods + 1)) / 2;

      for (let i = 1; i <= totalPeriods; i++) {
          if (i === totalPeriods) {
              const finalPayment = totalRepaymentInKobo - accumulatedPayment;
              const finalInterest = Math.round(finalPayment * (totalProfitInKobo / totalRepaymentInKobo));
              const finalPrincipal = finalPayment - finalInterest;

              schedule.push({
                  installment: i,
                  dueDate: addPeriod(termStartDate, i),
                  payment: finalPayment / 100,
                  principal: (remainingBalanceInKobo / 100), // The last principal payment must be the remaining balance
                  interest: (finalPayment - remainingBalanceInKobo) / 100,
                  balance: 0,
              });

          } else {
              const profitProportion = (totalPeriods - i + 1) / sumOfDigits;
              const interestPaymentInKobo = Math.round(totalProfitInKobo * profitProportion);
              const principalPaymentInKobo = equalPaymentInKobo - interestPaymentInKobo;
              
              remainingBalanceInKobo -= principalPaymentInKobo;
              accumulatedPayment += equalPaymentInKobo;

              schedule.push({
                  installment: i,
                  dueDate: addPeriod(termStartDate, i),
                  payment: equalPaymentInKobo / 100,
                  principal: principalPaymentInKobo / 100,
                  interest: interestPaymentInKobo / 100,
                  balance: remainingBalanceInKobo / 100,
              });
          }
      }
  }

  return schedule;
}
