import { roundCurrency } from '@/lib/financial-integrity';

export function assertValidOwnerConfiguration(input: {
  totalShares: number;
  retainedPercent: number;
  distributablePercent: number;
  activeShareUnits: number[];
}) {
  const { totalShares, retainedPercent, distributablePercent, activeShareUnits } = input;
  if (!Number.isInteger(totalShares) || totalShares <= 0) {
    throw new Error('Owner profit policy requires a positive whole-number share total.');
  }
  if (retainedPercent < 0 || distributablePercent < 0 || retainedPercent + distributablePercent !== 100) {
    throw new Error('Owner profit percentages must be non-negative and total exactly 100%.');
  }
  if (activeShareUnits.some((shares) => !Number.isInteger(shares) || shares <= 0)) {
    throw new Error('Every active owner must have positive whole-number share units.');
  }
  const activeShares = activeShareUnits.reduce((sum, shares) => sum + shares, 0);
  if (activeShares !== totalShares) {
    throw new Error(`Ownership configuration mismatch: ${activeShares} active shares are assigned against ${totalShares} policy shares.`);
  }
  return { activeShares };
}

export function calculateOwnerBalances(input: {
  allocated: number;
  approvedWithdrawals: number;
  liquidOwnerFunds: number;
  pendingWithdrawals?: number;
}) {
  const allocated = roundCurrency(Math.max(0, input.allocated));
  const approved = roundCurrency(Math.max(0, input.approvedWithdrawals));
  const pending = roundCurrency(Math.max(0, input.pendingWithdrawals || 0));
  const liquid = roundCurrency(Math.max(0, input.liquidOwnerFunds));
  const unwithdrawn = roundCurrency(Math.max(0, allocated - approved));
  const availableLedger = roundCurrency(Math.max(0, unwithdrawn - pending));
  const availableLiquid = roundCurrency(Math.max(0, liquid - pending));
  return {
    unwithdrawn,
    withdrawable: Math.min(availableLedger, availableLiquid),
    invested: roundCurrency(Math.max(0, unwithdrawn - liquid)),
  };
}
