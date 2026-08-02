import { roundCurrency } from '@/lib/financial-integrity';

export const ZAKAT_RATE = 0.025;

function validDate(value: Date | null | undefined): value is Date {
  return Boolean(value && !Number.isNaN(value.getTime()));
}

/** The annual assessment follows the Gregorian anniversary used by the agreement. */
export function getNextZakatAssessmentDate(baseDate: Date): Date {
  if (!validDate(baseDate)) throw new Error('A valid Zakat assessment base date is required.');

  const next = new Date(baseDate.getTime());
  const originalMonth = next.getUTCMonth();
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  // A 29 February anniversary falls on 28 February in a non-leap year.
  if (next.getUTCMonth() !== originalMonth) next.setUTCDate(0);
  return next;
}

export function isZakatDue(input: {
  firstDepositDate?: Date | null;
  lastAssessmentDate?: Date | null;
  lastPaymentDate?: Date | null;
  now?: Date;
}): boolean {
  const baseDate = validDate(input.lastAssessmentDate)
    ? input.lastAssessmentDate
    : validDate(input.lastPaymentDate)
    ? input.lastPaymentDate
    : validDate(input.firstDepositDate)
      ? input.firstDepositDate
      : null;
  if (!baseDate) return false;

  const now = input.now || new Date();
  return validDate(now) && now >= getNextZakatAssessmentDate(baseDate);
}

export function calculateZakatAmount(portfolioValue: number, nisab: number): number {
  const normalizedPortfolio = roundCurrency(portfolioValue);
  const normalizedNisab = roundCurrency(nisab);
  if (normalizedNisab <= 0 || normalizedPortfolio < normalizedNisab) return 0;
  return roundCurrency(normalizedPortfolio * ZAKAT_RATE);
}
