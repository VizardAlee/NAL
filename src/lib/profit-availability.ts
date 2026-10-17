import { assertPositiveCurrencyAmount, calculateAvailableProfit, calculateFundBatchAnniversaryWindow, type AnniversaryFundBatch, type AnniversaryWithdrawalRequest, type LedgerEntry } from '@/lib/financial-integrity';
import { isProfitDistributionLocked } from '@/lib/workflow-eligibility';

type PendingRequest = AnniversaryWithdrawalRequest & { id?: string; type?: string };
type ProfitBatch = AnniversaryFundBatch & Record<string, unknown>;

/** Profit is a cash sub-ledger; principal fund batches are not its spending balance. */
export function calculateProfitAvailability(input: {
  fundBatches: ProfitBatch[];
  entries: LedgerEntry[];
  withdrawalRequests: PendingRequest[];
  reinvestmentRequests: PendingRequest[];
  now?: Date;
}) {
  const now = input.now || new Date();
  const window = calculateFundBatchAnniversaryWindow({ ...input, now });
  let reservationsBlocked = false;
  const reservations = [...input.withdrawalRequests.filter(request => request.status === 'Pending' && request.source !== 'Capital' && request.type !== 'OwnerWithdrawal'), ...input.reinvestmentRequests.filter(request => request.status === 'Pending')];
  const reservedKobo = reservations.reduce((sum, request) => {
    try { return sum + Math.round(assertPositiveCurrencyAmount(request.amount) * 100); }
    catch { reservationsBlocked = true; return sum; }
  }, 0);
  if (!Number.isSafeInteger(reservedKobo)) reservationsBlocked = true;
  const batches = new Map(input.fundBatches.map(batch => [batch.id, batch]));
  const eligibleEntries = input.entries.filter(entry => {
    if (entry.type !== 'ProfitDistribution') return true;
    if (!entry.fundBatchId) return false;
    const batch = batches.get(entry.fundBatchId);
    // A linked earning is not unlocked by a missing or foreign source batch.
    return Boolean(batch && !isProfitDistributionLocked(batch, entry, now));
  });
  const availableProfit = reservationsBlocked ? 0 : calculateAvailableProfit(eligibleEntries, reservedKobo / 100);
  const globallyAvailableProfit = reservationsBlocked ? 0 : calculateAvailableProfit(input.entries, reservedKobo / 100);
  // Pending annual requests are already reserved above. Reserve only the unused
  // allowance here, once, while also enforcing the ordinary maturity boundary.
  const reinvestibleProfit = reservationsBlocked ? 0 : Math.min(availableProfit, calculateAvailableProfit(input.entries, reservedKobo / 100 + window.availableToWithdraw));
  return { window, eligibleEntries, availableProfit, globallyAvailableProfit, reinvestibleProfit, reservationsBlocked };
}
