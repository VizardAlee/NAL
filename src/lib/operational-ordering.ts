type DateLike = Date | { toDate(): Date } | null | undefined;

function millis(value: DateLike): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = value instanceof Date ? value : value.toDate();
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

export function repaymentStatusPriority(status?: string): number {
  if (['Pending', 'Requested', 'ActionRequired'].includes(String(status))) return 0;
  if (['Active', 'Overdue'].includes(String(status))) return 1;
  if (['Approved', 'Completed'].includes(String(status))) return 2;
  return 3;
}

export function sortRepaymentRecords<T extends { status?: string; dueDate?: DateLike; installmentNumber?: number; lodgedAt?: DateLike; id?: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => repaymentStatusPriority(left.status) - repaymentStatusPriority(right.status)
    || millis(left.dueDate) - millis(right.dueDate)
    || Number(left.installmentNumber || 0) - Number(right.installmentNumber || 0)
    || millis(left.lodgedAt) - millis(right.lodgedAt)
    || String(left.id || '').localeCompare(String(right.id || '')));
}

export function repaymentFrequencyPriority(frequency?: string): number {
  return String(frequency).toLowerCase() === 'daily' ? 0 : 1;
}

export function sortDefaulterRecords<T extends { repaymentFrequency?: string; daysPastDue?: number; daysInDefault?: number; amountOutstanding?: number; amountDue?: number; overdueAmount?: number; dueDate?: DateLike; id?: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => repaymentFrequencyPriority(left.repaymentFrequency) - repaymentFrequencyPriority(right.repaymentFrequency)
    || Number(right.daysInDefault ?? right.daysPastDue ?? 0) - Number(left.daysInDefault ?? left.daysPastDue ?? 0)
    || Number(right.overdueAmount ?? right.amountOutstanding ?? right.amountDue ?? 0) - Number(left.overdueAmount ?? left.amountOutstanding ?? left.amountDue ?? 0)
    || millis(left.dueDate) - millis(right.dueDate)
    || String(left.id || '').localeCompare(String(right.id || '')));
}

