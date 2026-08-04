import { createHash } from 'node:crypto';

export function ownerWithdrawalRequestId(userId: string, windowLabel: string) {
  const windowKey = createHash('sha256').update(`${userId}:${windowLabel}`).digest('hex').slice(0, 32);
  return `owner_${windowKey}`;
}
