import { addDays, differenceInCalendarDays, subDays } from 'date-fns';

export type DurationUnit = 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';

/** NAL contractual durations are fixed-day periods. A deal month is always 30 days. */
export function durationToDays(value: number, unit: DurationUnit): number {
  const wholeValue = Math.max(0, Math.trunc(Number(value) || 0));
  const multipliers: Record<DurationUnit, number> = {
    Days: 1,
    Weeks: 7,
    Fortnights: 14,
    Months: 30,
    Years: 365,
  };
  return wholeValue * multipliers[unit];
}

/** Returns the exclusive end of a contractual term. */
export function addDealDuration(start: Date, value: number, unit: DurationUnit): Date {
  return addDays(start, durationToDays(value, unit));
}

/** Agreements display an inclusive maturity date, one day before the exclusive end. */
export function calculateInclusiveMaturityDate(start: Date, value: number, unit: DurationUnit): Date {
  return subDays(addDealDuration(start, value, unit), 1);
}

export function repaymentFrequencyDays(frequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly'): number {
  return { Daily: 1, Weekly: 7, Fortnightly: 14, Monthly: 30 }[frequency];
}

export function contractualPeriodCount(start: Date, end: Date, frequency: 'Daily' | 'Weekly' | 'Fortnightly' | 'Monthly'): number {
  return Math.max(1, Math.floor(differenceInCalendarDays(end, start) / repaymentFrequencyDays(frequency)));
}

