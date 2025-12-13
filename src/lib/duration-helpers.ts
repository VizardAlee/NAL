
type DurationUnit = 'Days' | 'Weeks' | 'Fortnights' | 'Months' | 'Years';

const DURATION_IN_DAYS: Record<DurationUnit, number> = {
  Days: 1,
  Weeks: 7,
  Fortnights: 14,
  Months: 30.4375, // Average days in month
  Years: 365.25,
};

/**
 * Checks if a given duration is 3 months or less.
 * @param value - The numeric value of the duration.
 * @param unit - The unit of the duration.
 * @returns True if the duration is <= 3 months, false otherwise.
 */
export function isDurationShort(value: number, unit: DurationUnit): boolean {
  if (!value || !unit) {
    return false;
  }
  const durationInDays = value * (DURATION_IN_DAYS[unit] || 0);
  const threeMonthsInDays = 3 * DURATION_IN_DAYS.Months;
  
  // Using a small tolerance to account for floating point inaccuracies
  return durationInDays <= threeMonthsInDays + 0.1;
}
