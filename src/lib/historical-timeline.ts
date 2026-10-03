import type { HistoricalFundPosition, HistoricalFundTransaction } from './historical-import';

export type HistoricalTimelineEntry = { amount: number; date: string; reference: string; documentName: string; openingBalance: boolean; dealId?: string };
const money = (value: number) => Math.round(value * 100) / 100;

// Detailed history is a breakdown of the confirmed total, never an extra credit.
// Unknown dates remain explicitly labelled cutoff opening balances.
export function historicalTimeline(total: number, entries: Array<Omit<HistoricalTimelineEntry, 'openingBalance'>>, cutoff: string): HistoricalTimelineEntry[] {
  const ordered = entries.map(entry => ({ ...entry, openingBalance: false })).sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
  const residual = money(total - ordered.reduce((sum, entry) => sum + entry.amount, 0));
  if (residual < -0.01) throw new Error('Dated history exceeds the confirmed opening total.');
  if (residual > 0.01) ordered.push({ amount: residual, date: cutoff, reference: '', documentName: '', openingBalance: true });
  return ordered;
}

export function historicalFundTimeline(position: HistoricalFundPosition, type: HistoricalFundTransaction['type'], cutoff: string) {
  const totals = { Deposit: position.totalDeposited, Withdrawal: position.totalWithdrawn, ProfitDistribution: position.realisedProfit, PrincipalReturn: position.principalReturned };
  return historicalTimeline(totals[type], (position.transactions || []).filter(entry => entry.type === type), cutoff);
}
