/** Money in integer kobo. All ratios round half up once on the cumulative total. */
export const MARKETING_COMMISSION_POLICY = 1;
export function kobo(value: number): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('Invalid currency amount.');
  return Math.round(value * 100);
}
export function ratio(amount: number, numerator: number, denominator: number): number {
  if (![amount, numerator, denominator].every(Number.isSafeInteger) || amount < 0 || numerator < 0 || denominator <= 0) throw new Error('Invalid allocation basis.');
  const a = BigInt(amount) * BigInt(numerator), d = BigInt(denominator);
  return Number((a + d / BigInt(2)) / d);
}
export function commissionKobo(agreedProfit: number) { return ratio(kobo(agreedProfit), 5, 100); }
export function replenishmentTarget(fundedKobo: number, netClearedKobo: number, repaymentBasisKobo: number) {
  return Math.min(fundedKobo, ratio(fundedKobo, Math.min(Math.max(0, netClearedKobo), repaymentBasisKobo), repaymentBasisKobo));
}
export function netClearedKobo(receipts: Array<{ status?: string; amount?: number; refundedAmount?: number }>) {
  return receipts.reduce((sum, item) => item.status === 'Approved'
    ? sum + Math.max(0, kobo(Number(item.amount || 0)) - kobo(Number(item.refundedAmount || 0))) : sum, 0);
}
