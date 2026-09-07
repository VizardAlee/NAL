import { addDealDuration, durationToDays, type DurationUnit } from '@/lib/deal-duration';
import { addDays, differenceInCalendarDays } from 'date-fns';

export type AgreementStatusRecord = { status?: string } | null | undefined;

export function requiresManagementFee(deal: Record<string, unknown>): boolean {
  if (typeof deal.requiresManagementFee === 'boolean') return deal.requiresManagementFee;
  return Number(deal.managementFeeAmount || 0) > 0 || Number(deal.managementFeeRate || 0) > 0;
}

export function requiresAgreementSigning(deal: Record<string, unknown>): boolean {
  return deal.agreementSigningRequired !== false;
}

export function isAgreementExecuted(record: AgreementStatusRecord): boolean {
  return record?.status === 'EXECUTED';
}

export function requiredDealAgreementTypes(deal: Record<string, unknown>): Array<'MURABAHA' | 'WAKALAH' | 'KAFAALAH'> {
  if (!requiresAgreementSigning(deal)) return [];
  if ((deal.financingMode || 'Murabaha') !== 'Murabaha') return [];
  return ['MURABAHA', ...(deal.wakalahGranted === true ? ['WAKALAH' as const] : []), 'KAFAALAH'];
}

export function lockedUntilForBatch(batch: Record<string, unknown>): Date | null {
  const unit = batch.tenureUnit as DurationUnit | undefined;
  const value = Number(batch.tenureValue || 0);
  const rawStart = batch.paymentDate || batch.agreementDate || batch.createdAt;
  const start = rawStart instanceof Date
    ? rawStart
    : rawStart && typeof rawStart === 'object' && 'toDate' in rawStart
      ? (rawStart as { toDate(): Date }).toDate()
      : null;
  if (!start || !unit || durationToDays(value, unit) <= 90) return null;
  return addDealDuration(start, value, unit);
}

export function isBatchProfitLocked(batch: Record<string, unknown>, now = new Date()): boolean {
  const lockedUntil = lockedUntilForBatch(batch);
  return Boolean(lockedUntil && now < lockedUntil);
}

type DateValue = Date | { toDate(): Date } | null | undefined;

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate(): Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * A 90-day investment releases realised profit in three completed 30-day
 * periods. Longer investments remain wholly locked until maturity.
 */
export function profitUnlockDate(
  batch: Record<string, unknown>,
  entry: { createdAt?: DateValue; profitEarnedAt?: DateValue }
): Date | null {
  const unit = batch.tenureUnit as DurationUnit | undefined;
  const value = Number(batch.tenureValue || 0);
  if (!unit) return null;
  const durationDays = durationToDays(value, unit);
  const start = asDate(batch.paymentDate || batch.agreementDate || batch.createdAt);
  if (!start) return null;
  const maturity = addDealDuration(start, value, unit);
  if (durationDays > 90) return maturity;
  if (durationDays !== 90) return null;

  const earnedAt = asDate(entry.profitEarnedAt || entry.createdAt);
  if (!earnedAt) return maturity;
  const elapsedDays = Math.max(0, differenceInCalendarDays(earnedAt, start));
  const completedPeriod = Math.min(3, Math.max(1, Math.ceil(Math.max(1, elapsedDays) / 30)));
  return addDays(start, completedPeriod * 30);
}

export function isProfitDistributionLocked(
  batch: Record<string, unknown>,
  entry: { createdAt?: DateValue; profitEarnedAt?: DateValue },
  now = new Date()
): boolean {
  const unlocksAt = profitUnlockDate(batch, entry);
  return Boolean(unlocksAt && now < unlocksAt);
}
