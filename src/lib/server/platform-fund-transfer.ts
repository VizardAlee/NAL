import type { Firestore } from 'firebase-admin/firestore';
import { assertPositiveCurrencyAmount } from '@/lib/financial-integrity';

/** Transfers availability between company accounts; never sends external money. */
export async function transferPlatformFunds(db: Firestore, actorId: string, input: {
  operationId: string; direction: 'toInvestible' | 'fromInvestible'; amount: number;
}) {
  const amount = assertPositiveCurrencyAmount(input.amount), amountKobo = Math.round(amount * 100);
  const operation = db.collection('platformFundTransfers').doc(input.operationId);
  const sourceRef = db.collection('fundBatches').doc(`platform-transfer-${input.operationId}`);
  await db.runTransaction(async trx => {
    const prior = await trx.get(operation);
    if (prior.exists) {
      if (prior.data()?.direction !== input.direction || prior.data()?.amountKobo !== amountKobo) throw new Error('Transfer operation ID was already used for different data.');
      return;
    }
    const deductions: Array<{ ref: FirebaseFirestore.DocumentReference; remainingKobo: number; amountKobo: number }> = [];
    if (input.direction === 'fromInvestible') {
      const sources = await trx.get(db.collection('fundBatches').where('sourceId', '==', 'platform'));
      let outstanding = amountKobo;
      for (const source of sources.docs.sort((a,b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0) || a.id.localeCompare(b.id))) {
        const data = source.data();
        if (data.marketingReserved || data.sourceType === 'OwnerProfitAutoAllocation') continue;
        const remainingKobo = Math.max(0, Math.round(Number(data.remainingAmount || 0) * 100));
        if (!Number.isSafeInteger(remainingKobo)) throw new Error('Invalid source balance.');
        const take = Math.min(outstanding, remainingKobo);
        if (take) deductions.push({ ref: source.ref, remainingKobo, amountKobo: take });
        outstanding -= take;
        if (!outstanding) break;
      }
      if (outstanding) throw new Error('Insufficient current investible company funds. Reload balances; a marketing reservation or another transfer may have used them.');
    } else {
      const [ledger, pool] = await Promise.all([trx.get(db.collection('administrativeTransactions')), trx.get(db.doc('marketingPools/main'))]);
      const ledgerKobo = ledger.docs.reduce((sum,d) => sum + Math.round(Number(d.data().amount || 0) * 100), 0);
      const reservedKobo = Math.max(0, Number(pool.data()?.balanceKobo || 0));
      if (!Number.isSafeInteger(ledgerKobo) || amountKobo > ledgerKobo - reservedKobo) throw new Error('Insufficient unreserved administrative funds. Marketing pool reserves cannot be transferred to investible capital.');
    }
    const now = new Date();
    for (const source of deductions) trx.update(source.ref, { remainingAmount: (source.remainingKobo - source.amountKobo) / 100 });
    if (input.direction === 'toInvestible') trx.create(sourceRef, { sourceId: 'platform', amount, remainingAmount: amount, tenureValue: 10, tenureUnit: 'Years', createdAt: now, platformTransferId: input.operationId });
    trx.create(db.collection('administrativeTransactions').doc(), {
      type: input.direction === 'toInvestible' ? 'TransferToInvestible' : 'TransferFromInvestible',
      amount: input.direction === 'toInvestible' ? -amount : amount,
      description: input.direction === 'toInvestible' ? 'Transfer to Investible Capital' : 'Transfer from Investible Capital',
      platformTransferId: input.operationId, actorId, createdAt: now,
    });
    trx.create(operation, { direction: input.direction, amountKobo, actorId, createdAt: now, deductions: deductions.map(d => ({ fundBatchId: d.ref.id, amountKobo: d.amountKobo })) });
  });
  return { success: true as const, fundBatchId: input.direction === 'toInvestible' ? sourceRef.id : null };
}
