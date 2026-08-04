export const RECOVERY_STATUSES = [
  'UPCOMING',
  'DUE',
  'OVERDUE',
  'PROMISE_TO_PAY',
  'BROKEN_PROMISE',
] as const;

export const LEGAL_STATUSES = [
  'ESCALATED_LEGAL',
  'NOTICE_PREPARATION',
  'DEMAND_ISSUED',
  'NEGOTIATION',
  'COURT_PROCEEDINGS',
  'JUDGMENT',
  'SETTLED',
] as const;

export const CLOSED_RECOVERY_STATUSES = ['RESOLVED', 'CLOSED'] as const;

export type RecoveryStatus =
  | (typeof RECOVERY_STATUSES)[number]
  | (typeof LEGAL_STATUSES)[number]
  | (typeof CLOSED_RECOVERY_STATUSES)[number]
  | 'Due_Recovery'
  | 'Escalated_Legal'
  | 'Resolved';

export type RecoveryActor = 'RECOVERY' | 'LEGAL' | 'ADMIN' | 'AUTOMATION';

export type RecoveryPayment = {
  amount?: number;
  installmentNumber?: number;
  status?: string;
};

export const RECOVERY_OUTCOMES = [
  'CONTACTED',
  'NO_ANSWER',
  'NUMBER_UNREACHABLE',
  'CLIENT_DISPUTES_BALANCE',
  'PROMISE_TO_PAY',
  'PAYMENT_CONFIRMED',
  'FOLLOW_UP_REQUIRED',
] as const;

export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number];

export const CONTACT_CHANNELS = ['PHONE', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export function recoveryTaskId(dealId: string, installmentNumber: number): string {
  return `${dealId}_${installmentNumber}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function roundRecoveryCurrency(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function calculateInstallmentOutstanding(
  scheduledAmount: number,
  installmentNumber: number,
  repayments: RecoveryPayment[]
) {
  const scheduledKobo = Math.max(0, Math.round((Number(scheduledAmount) || 0) * 100));
  const approvedKobo = repayments
    .filter((repayment) => repayment.status === 'Approved' && Number(repayment.installmentNumber) === installmentNumber)
    .reduce((sum, repayment) => sum + Math.max(0, Math.round((Number(repayment.amount) || 0) * 100)), 0);
  const paidKobo = Math.min(scheduledKobo, approvedKobo);
  return {
    scheduledAmount: scheduledKobo / 100,
    amountPaid: paidKobo / 100,
    amountOutstanding: Math.max(0, scheduledKobo - paidKobo) / 100,
    fullyPaid: paidKobo >= scheduledKobo,
  };
}

export function normalizeRecoveryStatus(status?: string): RecoveryStatus {
  if (status === 'Due_Recovery') return 'OVERDUE';
  if (status === 'Escalated_Legal') return 'ESCALATED_LEGAL';
  if (status === 'Resolved') return 'RESOLVED';
  const known = [...RECOVERY_STATUSES, ...LEGAL_STATUSES, ...CLOSED_RECOVERY_STATUSES] as readonly string[];
  return known.includes(status || '') ? status as RecoveryStatus : 'UPCOMING';
}

export function isRecoveryStatus(status?: string): boolean {
  return (RECOVERY_STATUSES as readonly string[]).includes(normalizeRecoveryStatus(status));
}

export function isLegalStatus(status?: string): boolean {
  return (LEGAL_STATUSES as readonly string[]).includes(normalizeRecoveryStatus(status));
}

export function isClosedRecoveryStatus(status?: string): boolean {
  return (CLOSED_RECOVERY_STATUSES as readonly string[]).includes(normalizeRecoveryStatus(status));
}

export function deriveAutomatedRecoveryStatus(input: {
  currentStatus?: string;
  daysUntilDue: number;
  amountOutstanding: number;
  promiseDueAt?: Date | null;
  now?: Date;
}): RecoveryStatus {
  if (roundRecoveryCurrency(input.amountOutstanding) <= 0) return 'RESOLVED';
  const current = normalizeRecoveryStatus(input.currentStatus);
  if (isLegalStatus(current) || current === 'CLOSED') return current;
  const now = input.now || new Date();
  if (current === 'PROMISE_TO_PAY' && input.promiseDueAt) {
    return input.promiseDueAt.getTime() < now.getTime() ? 'BROKEN_PROMISE' : 'PROMISE_TO_PAY';
  }
  if (current === 'BROKEN_PROMISE') return current;
  if (input.daysUntilDue <= -7) return 'ESCALATED_LEGAL';
  if (input.daysUntilDue < 0) return 'OVERDUE';
  if (input.daysUntilDue === 0) return 'DUE';
  return 'UPCOMING';
}

const TRANSITIONS: Record<RecoveryActor, Partial<Record<RecoveryStatus, RecoveryStatus[]>>> = {
  AUTOMATION: {},
  RECOVERY: {
    UPCOMING: ['PROMISE_TO_PAY', 'ESCALATED_LEGAL'],
    DUE: ['PROMISE_TO_PAY', 'ESCALATED_LEGAL'],
    OVERDUE: ['PROMISE_TO_PAY', 'ESCALATED_LEGAL'],
    PROMISE_TO_PAY: ['BROKEN_PROMISE', 'ESCALATED_LEGAL'],
    BROKEN_PROMISE: ['PROMISE_TO_PAY', 'ESCALATED_LEGAL'],
  },
  LEGAL: {
    ESCALATED_LEGAL: ['NOTICE_PREPARATION', 'NEGOTIATION', 'SETTLED', 'RESOLVED'],
    NOTICE_PREPARATION: ['DEMAND_ISSUED', 'NEGOTIATION', 'SETTLED', 'RESOLVED'],
    DEMAND_ISSUED: ['NEGOTIATION', 'COURT_PROCEEDINGS', 'SETTLED', 'RESOLVED'],
    NEGOTIATION: ['DEMAND_ISSUED', 'COURT_PROCEEDINGS', 'SETTLED', 'RESOLVED'],
    COURT_PROCEEDINGS: ['JUDGMENT', 'SETTLED', 'RESOLVED'],
    JUDGMENT: ['SETTLED', 'RESOLVED'],
    SETTLED: ['RESOLVED', 'CLOSED'],
  },
  ADMIN: {},
};

export function canTransitionRecoveryStatus(from: string, to: string, actor: RecoveryActor): boolean {
  const normalizedFrom = normalizeRecoveryStatus(from);
  const normalizedTo = normalizeRecoveryStatus(to);
  if (actor === 'ADMIN') return normalizedFrom !== normalizedTo;
  if (actor === 'AUTOMATION') return true;
  return Boolean(TRANSITIONS[actor][normalizedFrom]?.includes(normalizedTo));
}

export function recoveryStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    UPCOMING: 'Upcoming', DUE: 'Due today', OVERDUE: 'Overdue', PROMISE_TO_PAY: 'Promise to pay',
    BROKEN_PROMISE: 'Broken promise', ESCALATED_LEGAL: 'Escalated to Legal', NOTICE_PREPARATION: 'Notice preparation',
    DEMAND_ISSUED: 'Demand issued', NEGOTIATION: 'Negotiation', COURT_PROCEEDINGS: 'Court proceedings',
    JUDGMENT: 'Judgment', SETTLED: 'Settled', RESOLVED: 'Resolved', CLOSED: 'Closed',
  };
  const normalized = normalizeRecoveryStatus(status);
  return labels[normalized] || normalized;
}
