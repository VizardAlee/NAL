
import { add, formatISO } from 'date-fns';
import { Deal } from './types';

export interface ScheduleInstallment {
  installment: number;
  dueDate: Date;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export function generateAmortizationSchedule(deal: Deal): ScheduleInstallment[] {
  if (deal.repaymentType === 'Balloon Payment' || !deal.createdAt) {
    // Simplified handling for balloon payments for now
    return [];
  }

  const principal = deal.principal;
  // Note: The interest rate from the deal is annual. We need to convert it to the rate per period.
  const frequencyMap = {
    Daily: 365,
    Weekly: 52,
    Fortnightly: 26,
    Monthly: 12,
    Years: 1, // This is likely wrong, but let's assume monthly if years
  };
  const periodsPerYear = frequencyMap[deal.repaymentFrequency] || 12;
  const interestRatePerPeriod = deal.interestRate / 100 / periodsPerYear;

  const durationMap = {
    Days: (v: number) => v / (365 / periodsPerYear),
    Weeks: (v: number) => v / (52 / periodsPerYear),
    Fortnights: (v: number) => v / (26 / periodsPerYear),
    Monthly: (v: number) => v,
    Years: (v: number) => v * 12,
  };
  const totalPeriods = Math.round(durationMap[deal.durationUnit](deal.durationValue));

  if (interestRatePerPeriod === 0 || totalPeriods === 0) return [];
  
  // Standard formula for equal installment payment (EMI)
  const monthlyPayment = principal * interestRatePerPeriod * 
    (Math.pow(1 + interestRatePerPeriod, totalPeriods)) / 
    (Math.pow(1 + interestRatePerPeriod, totalPeriods) - 1);

  const schedule: ScheduleInstallment[] = [];
  let remainingBalance = principal;
  const startDate = deal.createdAt.toDate();

  for (let i = 1; i <= totalPeriods; i++) {
    const interestPayment = remainingBalance * interestRatePerPeriod;
    const principalPayment = monthlyPayment - interestPayment;
    remainingBalance -= principalPayment;

    // Make sure balance doesn't go negative on the last payment due to rounding
    if (i === totalPeriods && remainingBalance < 1 && remainingBalance > -1) {
        remainingBalance = 0;
    }

    const getDueDate = () => {
        switch (deal.repaymentFrequency) {
            case 'Daily': return add(startDate, { days: i });
            case 'Weekly': return add(startDate, { weeks: i });
            case 'Fortnightly': return add(startDate, { weeks: i * 2 });
            case 'Monthly': return add(startDate, { months: i });
            case 'Years': return add(startDate, { years: i });
            default: return add(startDate, { months: i });
        }
    }

    schedule.push({
      installment: i,
      dueDate: getDueDate(),
      payment: monthlyPayment,
      principal: principalPayment,
      interest: interestPayment,
      balance: remainingBalance,
    });
  }

  return schedule;
}
