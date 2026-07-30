import type { ScheduleInstallment } from '@/lib/amortization';
import type { Deal } from '@/lib/types';

export type RepaymentProgressRecord = {
  amount?: number;
  installmentNumber?: number;
  status?: string;
};

export type RepaymentCheckpoint = {
  key: string;
  label: string;
  scheduled: number;
  approved: number;
  pending: number;
  remaining: number;
  progressPercent: number;
  minorCheckpoints: Array<{
    key: string;
    label: string;
    positionPercent: number;
  }>;
};

export type RepaymentProgress = {
  totalScheduled: number;
  totalApproved: number;
  totalPending: number;
  totalRemaining: number;
  progressPercent: number;
  majorUnitLabel: string;
  minorUnitLabel: string;
  checkpoints: RepaymentCheckpoint[];
};

type PeriodUnit = 'installment' | 'week' | 'month' | 'quarter' | 'year';

function toKobo(value: number | undefined): number {
  return Math.round(Number(value || 0) * 100);
}

function fromKobo(value: number): number {
  return value / 100;
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function weekStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function periodKey(date: Date, unit: PeriodUnit, installment: number): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  switch (unit) {
    case 'installment':
      return `installment-${installment}`;
    case 'week':
      return `week-${dateKey(weekStart(date))}`;
    case 'month':
      return `month-${year}-${String(month).padStart(2, '0')}`;
    case 'quarter':
      return `quarter-${year}-${Math.floor(date.getMonth() / 3) + 1}`;
    case 'year':
      return `year-${year}`;
  }
}

function periodLabel(date: Date, unit: PeriodUnit, installment: number): string {
  switch (unit) {
    case 'installment':
      return `#${installment}`;
    case 'week':
      return `Week of ${new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'short',
      }).format(weekStart(date))}`;
    case 'month':
      return new Intl.DateTimeFormat('en-NG', {
        month: 'short',
        year: 'numeric',
      }).format(date);
    case 'quarter':
      return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
    case 'year':
      return String(date.getFullYear());
  }
}

function chooseCheckpointUnits(
  frequency: Deal['repaymentFrequency'],
  schedule: ScheduleInstallment[]
): { major: PeriodUnit; minor: PeriodUnit } {
  const months = new Set(
    schedule.map(({ dueDate }) => `${dueDate.getFullYear()}-${dueDate.getMonth()}`)
  );
  const years = new Set(schedule.map(({ dueDate }) => dueDate.getFullYear()));

  if (frequency !== 'Monthly') {
    return months.size > 1
      ? { major: 'month', minor: 'week' }
      : { major: 'week', minor: 'installment' };
  }

  if (years.size > 1 && schedule.length > 12) {
    return { major: 'year', minor: 'month' };
  }
  if (schedule.length > 3) {
    return { major: 'quarter', minor: 'month' };
  }
  return { major: 'month', minor: 'installment' };
}

function unitName(unit: PeriodUnit): string {
  return unit === 'installment'
    ? 'installment'
    : unit;
}

export function calculateRepaymentProgress(
  frequency: Deal['repaymentFrequency'],
  schedule: ScheduleInstallment[],
  repayments: RepaymentProgressRecord[]
): RepaymentProgress {
  if (schedule.length === 0) {
    return {
      totalScheduled: 0,
      totalApproved: 0,
      totalPending: 0,
      totalRemaining: 0,
      progressPercent: 0,
      majorUnitLabel: 'period',
      minorUnitLabel: 'installment',
      checkpoints: [],
    };
  }

  const { major, minor } = chooseCheckpointUnits(frequency, schedule);
  const approvedByInstallment = new Map<number, number>();
  const pendingByInstallment = new Map<number, number>();

  repayments.forEach((repayment) => {
    const installment = Number(repayment.installmentNumber);
    const amount = toKobo(repayment.amount);
    if (!Number.isInteger(installment) || installment <= 0 || amount <= 0) return;

    if (repayment.status === 'Approved') {
      approvedByInstallment.set(
        installment,
        (approvedByInstallment.get(installment) || 0) + amount
      );
    } else if (repayment.status === 'Pending') {
      pendingByInstallment.set(
        installment,
        (pendingByInstallment.get(installment) || 0) + amount
      );
    }
  });

  const grouped = new Map<
    string,
    {
      key: string;
      label: string;
      scheduled: number;
      approved: number;
      pending: number;
      installments: Array<{ installment: ScheduleInstallment; scheduled: number }>;
    }
  >();

  schedule.forEach((installment) => {
    const key = periodKey(installment.dueDate, major, installment.installment);
    const scheduled = toKobo(installment.payment);
    const approved = Math.min(
      scheduled,
      approvedByInstallment.get(installment.installment) || 0
    );
    const pending = Math.min(
      Math.max(0, scheduled - approved),
      pendingByInstallment.get(installment.installment) || 0
    );
    const current = grouped.get(key) || {
      key,
      label: periodLabel(installment.dueDate, major, installment.installment),
      scheduled: 0,
      approved: 0,
      pending: 0,
      installments: [],
    };

    current.scheduled += scheduled;
    current.approved += approved;
    current.pending += pending;
    current.installments.push({ installment, scheduled });
    grouped.set(key, current);
  });

  const checkpoints = Array.from(grouped.values()).map((group): RepaymentCheckpoint => {
    const minorGroups = new Map<
      string,
      { key: string; label: string; scheduled: number }
    >();

    group.installments.forEach(({ installment, scheduled }) => {
      const key = periodKey(installment.dueDate, minor, installment.installment);
      const current = minorGroups.get(key) || {
        key,
        label: periodLabel(installment.dueDate, minor, installment.installment),
        scheduled: 0,
      };
      current.scheduled += scheduled;
      minorGroups.set(key, current);
    });

    let cumulativeScheduled = 0;
    const minorCheckpoints = Array.from(minorGroups.values())
      .slice(0, -1)
      .map((minorGroup) => {
        cumulativeScheduled += minorGroup.scheduled;
        return {
          key: `${group.key}-${minorGroup.key}`,
          label: minorGroup.label,
          positionPercent: group.scheduled > 0
            ? (cumulativeScheduled / group.scheduled) * 100
            : 0,
        };
      });

    return {
      key: group.key,
      label: group.label,
      scheduled: fromKobo(group.scheduled),
      approved: fromKobo(group.approved),
      pending: fromKobo(group.pending),
      remaining: fromKobo(Math.max(0, group.scheduled - group.approved)),
      progressPercent: group.scheduled > 0
        ? Math.min(100, (group.approved / group.scheduled) * 100)
        : 0,
      minorCheckpoints,
    };
  });

  const totalScheduledInKobo = checkpoints.reduce(
    (sum, checkpoint) => sum + toKobo(checkpoint.scheduled),
    0
  );
  const totalApprovedInKobo = checkpoints.reduce(
    (sum, checkpoint) => sum + toKobo(checkpoint.approved),
    0
  );
  const totalPendingInKobo = checkpoints.reduce(
    (sum, checkpoint) => sum + toKobo(checkpoint.pending),
    0
  );

  return {
    totalScheduled: fromKobo(totalScheduledInKobo),
    totalApproved: fromKobo(totalApprovedInKobo),
    totalPending: fromKobo(totalPendingInKobo),
    totalRemaining: fromKobo(Math.max(0, totalScheduledInKobo - totalApprovedInKobo)),
    progressPercent: totalScheduledInKobo > 0
      ? Math.min(100, (totalApprovedInKobo / totalScheduledInKobo) * 100)
      : 0,
    majorUnitLabel: unitName(major),
    minorUnitLabel: unitName(minor),
    checkpoints,
  };
}
