import type { ScheduleInstallment } from './amortization';
import { repaymentAmountForInstallment, type AllocationAwareRepayment } from './repayment-allocation';
import { isRepaymentReminderDue } from './repayment-reminders';

export function lagosDateKey(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid repayment date.');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
const dayNumber = (date: Date) => Date.parse(`${lagosDateKey(date)}T00:00:00Z`) / 86400000;
const kobo = (amount: number) => {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid repayment amount.');
  return Math.round(amount * 100);
};
export function normalizeWhatsAppPhone(value: string) {
  const cleaned = value.trim().replace(/[\s()+-]/g, '').replace(/^00/, '');
  const phone = /^0[789]\d{9}$/.test(cleaned) ? `234${cleaned.slice(1)}` : cleaned.replace(/^2340/, '234');
  if (!/^234[789]\d{9}$/.test(phone)) throw new Error('Enter a valid Nigerian WhatsApp number.');
  return phone;
}

export function repaymentProgress(input: {
  id: string; name: string; financingMode: string; frequency: string; startDate: Date;
  schedule: ScheduleInstallment[]; repayments: AllocationAwareRepayment[]; now: Date;
}) {
  const rows = [...input.schedule].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  if (!rows.length) throw new Error('The deal has no repayment schedule.');
  const approved = input.repayments.filter(payment => payment.status === 'Approved');
  const scheduled = rows.reduce((sum, row) => sum + kobo(row.payment), 0);
  const paid = approved.reduce((sum, payment) => sum + kobo(Number(payment.amount || 0)), 0);
  if (paid > scheduled) throw new Error('Approved repayments exceed the contractual schedule. Reconcile this deal first.');
  // Reject ambiguous legacy records instead of silently assuming an allocation.
  const allocated = approved.reduce((sum, payment) => sum + rows.reduce((total, row) => total + kobo(repaymentAmountForInstallment(payment, row.installment)), 0), 0);
  if (allocated !== paid) throw new Error('Approved repayments are missing valid installment allocations. Reconcile this deal first.');
  let expected = 0, shortfall = 0, futurePaid = 0, oldestOverdueDays = 0, due = false;
  for (const row of rows) {
    const rowPaid = approved.reduce((sum, payment) => sum + kobo(repaymentAmountForInstallment(payment, row.installment)), 0);
    if (rowPaid > kobo(row.payment)) throw new Error('An installment is over-allocated. Reconcile this deal first.');
    const remaining = kobo(row.payment) - rowPaid;
    const age = dayNumber(input.now) - dayNumber(row.dueDate);
    if (age >= 0) { expected += kobo(row.payment); shortfall += remaining; }
    else futurePaid += rowPaid;
    if (age > 0 && remaining > 0) oldestOverdueDays = Math.max(oldestOverdueDays, age);
    if (remaining > 0 && (isRepaymentReminderDue({ frequency: input.frequency, dueDate: row.dueDate, now: input.now }) || (input.frequency === 'Daily' && age > 0))) due = true;
  }
  const currentRow = rows.find(row => dayNumber(row.dueDate) >= dayNumber(input.now)) || rows[rows.length - 1];
  const periodIndex = Math.max(0, Math.floor((dayNumber(input.now) - dayNumber(rows[0].dueDate)) / 30));
  const periodStartDay = dayNumber(rows[0].dueDate) + periodIndex * 30;
  const lastDay = dayNumber(rows[rows.length - 1].dueDate);
  return {
    id: input.id, name: input.name, financingMode: input.financingMode, frequency: input.frequency,
    startDate: lagosDateKey(input.startDate), completionDate: lagosDateKey(rows[rows.length - 1].dueDate),
    expectedPaid: expected / 100, amountPaid: paid / 100, shortfall: shortfall / 100,
    totalObligation: scheduled / 100, remaining: (scheduled - paid) / 100, advancePaid: futurePaid / 100,
    periodicRepayment: currentRow.payment, oldestOverdueDays,
    dailyPaymentEquivalentsBehind: input.frequency === 'Daily' && currentRow.payment > 0 ? Math.ceil(shortfall / kobo(currentRow.payment)) : null,
    daysRemaining: Math.max(0, lastDay - dayNumber(input.now)),
    // Reporting blocks only: these never replace a contractual monthly due date.
    reportingPeriod: input.frequency === 'Daily' && periodStartDay <= lastDay ? {
      number: periodIndex + 1, start: new Date(periodStartDay * 86400000).toISOString().slice(0, 10),
      end: new Date(Math.min(periodStartDay + 29, lastDay) * 86400000).toISOString().slice(0, 10),
    } : null,
    due: due && paid < scheduled && (input.frequency !== 'Daily' || Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', hourCycle: 'h23' }).format(input.now)) >= 16),
  };
}

export type RepaymentProgress = ReturnType<typeof repaymentProgress>;
const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 }).format(amount);
const displayDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
const safeText = (value: string) => value.replace(/[\r\n*_~`]/g, ' ').trim();
export function buildRepaymentProgressNotice(input: {
  clientName: string; asOf: string; deals: RepaymentProgress[];
  account: { accountName: string; accountNumber: string; bankName: string }; previousAmountPaid?: number;
}) {
  if (!input.deals.length) throw new Error('No active facilities to report.');
  const sum = (field: 'amountPaid' | 'expectedPaid' | 'shortfall' | 'remaining' | 'totalObligation') => input.deals.reduce((total, deal) => total + kobo(deal[field]), 0) / 100;
  const amountPaid = sum('amountPaid');
  const allMurabaha = input.deals.every(deal => deal.financingMode === 'Murabaha');
  const lines = [
    `*${displayDate(input.asOf)}*`, `*${allMurabaha ? 'MURABAHA' : 'FACILITY'} REPAYMENT – ${input.deals.length > 1 ? 'CONSOLIDATED ' : ''}PROGRESS NOTICE – NAL*`,
    `Dear *${safeText(input.clientName)}*,`,
    `As of *${displayDate(input.asOf)}*, approved and reconciled repayments across your ${input.deals.length} active facility/facilities total *${money(amountPaid)}*.`,
  ];
  if (input.previousAmountPaid !== undefined) {
    const change = (kobo(amountPaid) - kobo(input.previousAmountPaid)) / 100;
    lines.push(`Net change in approved repayments since the previous sent notice: *${change < 0 ? '-' : ''}${money(Math.abs(change))}*.`);
  }
  input.deals.forEach((deal, index) => {
    lines.push('', `*${input.deals.length > 1 ? `DEAL ${index + 1} – ` : ''}${safeText(deal.name)}*`,
      `*Start Date:* ${displayDate(deal.startDate)}`, `*Repayment Frequency:* ${safeText(deal.frequency)}`,
      `*Periodic Repayment:* ${money(deal.periodicRepayment)}`, `*Schedule Completion:* ${displayDate(deal.completionDate)}`);
    if (deal.reportingPeriod) lines.push(`*Current 30-Day Reporting Period:* ${deal.reportingPeriod.number} (${displayDate(deal.reportingPeriod.start)} – ${displayDate(deal.reportingPeriod.end)})`);
    lines.push(`*Expected Paid by ${displayDate(input.asOf)}:* ${money(deal.expectedPaid)}`, `*Amount Paid So Far:* *${money(deal.amountPaid)}*`,
      `*Payment Shortfall:* *${money(deal.shortfall)}*`, `*Oldest Overdue Payment:* ${deal.oldestOverdueDays} day(s)`);
    if (deal.dailyPaymentEquivalentsBehind !== null) lines.push(`*Daily Repayment Equivalents Behind:* ${deal.dailyPaymentEquivalentsBehind}`);
    lines.push(`*Amount Remaining:* *${money(deal.remaining)}*`, `*Days Remaining:* ${deal.daysRemaining}`);
    if (deal.advancePaid > 0) lines.push(`*Already Allocated to Future Repayments:* ${money(deal.advancePaid)}`);
  });
  if (input.deals.length > 1) lines.push('', '*CONSOLIDATED POSITION*', `*Total Obligation:* ${money(sum('totalObligation'))}`, `*Total Expected Paid:* ${money(sum('expectedPaid'))}`, `*Total Amount Paid:* ${money(amountPaid)}`, `*Total Shortfall:* ${money(sum('shortfall'))}`, `*Total Outstanding:* ${money(sum('remaining'))}`);
  lines.push('', sum('shortfall') > 0 ? `Please clear the outstanding scheduled shortfall of *${money(sum('shortfall'))}* and continue paying according to each agreed schedule.` : 'Thank you. Please continue paying according to each agreed schedule.',
    '', '*Payment Details*', `*Account Name:* ${safeText(input.account.accountName)}`, `*Account Number:* ${safeText(input.account.accountNumber)}`, `*Bank:* ${safeText(input.account.bankName)}`,
    'Kindly send transaction confirmation after each payment for reconciliation. Submitted receipts are not counted until approved.', 'Thank you for your continued cooperation.', '*NAL GENERAL MERCHANT LTD*');
  return { text: lines.join('\n'), amountPaid, expectedPaid: sum('expectedPaid'), shortfall: sum('shortfall'), remaining: sum('remaining'), dealIds: input.deals.map(deal => deal.id) };
}
