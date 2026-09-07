
import { durationToDays, type DurationUnit } from '@/lib/deal-duration';

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
  return durationToDays(value, unit) <= 90;
}
