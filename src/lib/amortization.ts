
import { add, differenceInCalendarMonths, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal } from './types';

export interface ScheduleInstallment {
  installment: number;
  dueDate: Date;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

function getPeriods(deal: Deal): { totalPeriods: number; addPeriod: (date: Date, count: number) => Date } {
  if (!deal.createdAt) {
      return { totalPeriods: 0, addPeriod: (date, count) => add(date, { days: count }) };
  }
  const startDate = deal.createdAt.toDate();
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

  const endDate = add(startDate, { days: Math.round(durationInDays) });

  switch (deal.repaymentFrequency) {
    case 'Daily':
      totalPeriods = differenceInDays(endDate, startDate);
      addPeriod = (date, count) => add(date, { days: count });
      break;
    case 'Weekly':
      totalPeriods = differenceInWeeks(endDate, startDate);
      addPeriod = (date, count) => add(date, { weeks: count });
      break;
    case 'Fortnightly':
      totalPeriods = Math.floor(differenceInWeeks(endDate, startDate) / 2);
      addPeriod = (date, count) => add(date, { weeks: count * 2 });
      break;
    case 'Monthly':
      totalPeriods = differenceInCalendarMonths(endDate, startDate);
       if (totalPeriods === 0) { // Handle cases where duration is less than a month
          totalPeriods = Math.floor(differenceInDays(endDate, startDate) / 30);
      }
      addPeriod = (date, count) => add(date, { months: count });
      break;
    default:
      totalPeriods = differenceInCalendarMonths(endDate, startDate);
      addPeriod = (date, count) => add(date, { months: count });
      break;
  }
  return { totalPeriods: Math.max(1, totalPeriods), addPeriod };
}


export function generateAmortizationSchedule(deal: Deal): ScheduleInstallment[] {
  if (!deal.createdAt) return [];
  const principal = deal.principal;
  const annualRate = (deal.profitRate || 0) / 100;
  const startDate = deal.createdAt.toDate();
  const { totalPeriods, addPeriod } = getPeriods(deal);

  if (totalPeriods === 0) return [];
  
  const schedule: ScheduleInstallment[] = [];

  if (deal.repaymentType === 'Balloon Payment') {
    const durationInYears = (() => {
        switch (deal.durationUnit) {
            case 'Days': return deal.durationValue / 365.25;
            case 'Weeks': return deal.durationValue / 52;
            case 'Fortnights': return deal.durationValue / 26;
            case 'Months': return deal.durationValue / 12;
            case 'Years': return deal.durationValue;
            default: return 0;
        }
    })();
    const totalInterest = principal * annualRate * durationInYears;
    const interestPerInstallment = totalPeriods > 0 ? totalInterest / totalPeriods : 0;

    for (let i = 1; i <= totalPeriods; i++) {
        const isLastPayment = i === totalPeriods;
        const principalPayment = isLastPayment ? principal : 0;
        const payment = interestPerInstallment + principalPayment;
        const balance = isLastPayment ? 0 : principal;
        
        schedule.push({
            installment: i,
            dueDate: addPeriod(startDate, i),
            payment: payment,
            principal: principalPayment,
            interest: interestPerInstallment,
            balance: balance,
        });
    }

  } else { // Equal Installments
      const frequencyMap = {
        Daily: 365,
        Weekly: 52,
        Fortnightly: 26,
        Monthly: 12,
      };
      const periodsPerYear = frequencyMap[deal.repaymentFrequency] || 12;
      const interestRatePerPeriod = annualRate / periodsPerYear;
      
      let emi: number;
      if (interestRatePerPeriod === 0) {
        emi = principal / totalPeriods;
      } else {
        emi = principal * interestRatePerPeriod * 
          (Math.pow(1 + interestRatePerPeriod, totalPeriods)) / 
          (Math.pow(1 + interestRatePerPeriod, totalPeriods) - 1);
      }

      let remainingBalance = principal;

      for (let i = 1; i <= totalPeriods; i++) {
        const interestPayment = remainingBalance * interestRatePerPeriod;
        const principalPayment = emi - interestPayment;
        remainingBalance -= principalPayment;

        if (i === totalPeriods && Math.abs(remainingBalance) < 1) {
            remainingBalance = 0;
        }

        schedule.push({
          installment: i,
          dueDate: addPeriod(startDate, i),
          payment: emi,
          principal: principalPayment,
          interest: interestPayment,
          balance: remainingBalance,
        });
      }
  }

  return schedule;
}
