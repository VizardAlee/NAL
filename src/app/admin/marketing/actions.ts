'use server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { verifyAdminOrOwner, verifyAdminWrite } from '@/lib/server/auth';
import { hasPersona } from '@/lib/access-control';
import { kobo } from '@/lib/marketing-fund';
import { obligationRef, poolRef, prepareMarketingReplenishment, assertMarketingPoolCurrent } from '@/lib/server/marketing-fund';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,180}$/);
const money = z.number().finite().positive().refine(n => Number.isSafeInteger(n * 100) || Math.abs(Math.round(n * 100) - n * 100) < 0.00001, 'Use at most two decimal places.');
const base = z.object({ authToken: z.string().min(1), operationId: id.min(8) });
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export async function loadMarketingAdminAction(authToken: string) {
  await verifyAdminOrOwner(authToken);
  const [pool, commissions, batches, deals, users, events] = await Promise.all([
    poolRef().get(), adminDb.collection('marketingCommissions').get(),
    adminDb.collection('fundBatches').where('sourceId', '==', 'platform').get(),
    adminDb.collection('deals').get(), adminDb.collection('users').get(), adminDb.collection('marketingOperations').get(),
  ]);
  return {
    balanceKobo: Number(pool.data()?.balanceKobo || 0),
    commissions: commissions.docs.map(d => ({ id: d.id, marketerId: d.data().marketerId as string, marketerName: d.data().marketerName as string, earnedKobo: Number(d.data().earnedKobo), fundedKobo: Number(d.data().fundedKobo), replenishedKobo: Number(d.data().replenishedKobo), netClearedKobo: Number(d.data().netClearedKobo), repaymentBasisKobo: Number(d.data().repaymentBasisKobo), pendingReplenishmentKobo: Number(d.data().pendingReplenishmentKobo || 0) })),
    sources: batches.docs.filter(d => Number(d.data().remainingAmount) > 0 && d.data().sourceType !== 'OwnerProfitAutoAllocation' && !d.data().marketingReserved).map(d => ({ id: d.id, amount: Number(d.data().remainingAmount) })),
    deals: deals.docs.map(d => ({ id: d.id, name: String(d.data().dealName || d.id), clientName: String(d.data().clientName || ''), marketerId: String(d.data().marketerId || ''), status: String(d.data().status || ''), eligible: d.data().marketingCommissionPolicy === 1 })),
    marketers: users.docs.filter(d => hasPersona(d.data(), 'MARKETER')).map(d => ({ id: d.id, name: String(d.data().name || d.id) })),
    operations: events.docs.map(d => ({ id: d.id, kind: String(d.data().kind), amountKobo: Number(d.data().amountKobo || 0), reference: String(d.data().reference || d.data().reason || ''), createdAt: d.data().createdAt?.toDate?.().toISOString() || '' })).sort((a,b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function allocateMarketingFundsAction(input: unknown) {
  const value = base.extend({ sourceBatchId: id, sourceCategory: z.enum(['RETAINED_EARNINGS', 'SHAREHOLDER_FUNDS']), amount: money, reason: z.string().trim().min(5).max(500) }).parse(input);
  const actor = await verifyAdminWrite(value.authToken);
  const { authToken, ...payload } = value;
  void authToken;
  await adminDb.runTransaction(async trx => {
    const op = adminDb.doc(`marketingOperations/${value.operationId}`);
    const source = adminDb.doc(`fundBatches/${value.sourceBatchId}`);
    const [prior, batch, pool] = await Promise.all([trx.get(op), trx.get(source), trx.get(poolRef())]);
    const fingerprint = hash(JSON.stringify(payload));
    if (prior.exists) { if (prior.data()?.fingerprint !== fingerprint) throw new Error('Operation ID was already used for different data.'); return; }
    const amount = kobo(value.amount), remaining = kobo(Number(batch.data()?.remainingAmount || 0));
    if (batch.data()?.sourceId !== 'platform' || batch.data()?.sourceType === 'OwnerProfitAutoAllocation' || batch.data()?.marketingReserved || amount > remaining) throw new Error('Insufficient eligible company funds. Investor and personal owner funds are unavailable.');
    const now = Timestamp.now();
    trx.update(source, { remainingAmount: (remaining - amount) / 100 });
    trx.set(poolRef(), { balanceKobo: Number(pool.data()?.balanceKobo || 0) + amount, updatedAt: now }, { merge: true });
    trx.create(op, { ...payload, fingerprint, kind: 'SOURCE_ALLOCATION', amountKobo: amount, actorId: actor.uid, createdAt: now, repayableLoan: false });
    trx.create(adminDb.collection('administrativeTransactions').doc(), { type: 'TransferFromInvestible', amount: value.amount, description: `Marketing pool source allocation: ${value.reason}`, marketingOperationId: value.operationId, createdAt: now });
  });
  return { success: true as const };
}

export async function recordMarketingPayoutAction(input: unknown) {
  const value = base.extend({ dealId: id, amount: money, reference: z.string().trim().min(3).max(160) }).parse(input);
  const actor = await verifyAdminWrite(value.authToken);
  const { authToken, ...payload } = value;
  void authToken;
  await adminDb.runTransaction(async trx => {
    const op = adminDb.doc(`marketingOperations/${value.operationId}`), ref = obligationRef(value.dealId);
    const reference = adminDb.doc(`marketingPayoutReferences/${hash(value.reference.toUpperCase())}`);
    const [prior, obligation, pool, duplicate] = await Promise.all([trx.get(op), trx.get(ref), trx.get(poolRef()), trx.get(reference)]);
    const fingerprint = hash(JSON.stringify(payload));
    if (prior.exists) { if (prior.data()?.fingerprint !== fingerprint) throw new Error('Operation ID was already used for different data.'); return; }
    if (duplicate.exists) throw new Error('This external payment reference has already been recorded.');
    await assertMarketingPoolCurrent(trx);
    if (!obligation.exists) throw new Error('A signed, eligible commission obligation is required.');
    const data = obligation.data()!, amount = kobo(value.amount), balance = Number(pool.data()?.balanceKobo || 0);
    if (amount > balance) throw new Error('Marketing pool has insufficient funds. Allocate funds first.');
    if (amount > data.earnedKobo - data.fundedKobo) throw new Error('Payment exceeds earned outstanding commission.');
    const funded = data.fundedKobo + amount;
    const replenish = await prepareMarketingReplenishment(trx, { dealId: value.dealId, actorId: actor.uid, reason: `Commission payment ${value.reference}`, fundedKobo: funded });
    const now = Timestamp.now();
    replenish.write();
    trx.update(ref, { fundedKobo: funded, updatedAt: now });
    trx.set(poolRef(), { balanceKobo: balance - amount + replenish.poolDelta, updatedAt: now }, { merge: true });
    trx.create(op, { ...payload, fingerprint, kind: 'COMMISSION_PAYMENT', amountKobo: amount, marketerId: data.marketerId, actorId: actor.uid, createdAt: now });
    trx.create(reference, { operationId: value.operationId, createdAt: now });
    trx.create(ref.collection('events').doc(value.operationId), { kind: 'COMMISSION_PAYMENT', amountKobo: amount, reference: value.reference, actorId: actor.uid, createdAt: now });
    // Existing policy: staff/operating payouts are administrative Expense entries.
    // Source allocations and replenishments above are internal transfers, never expenses/revenue.
    trx.create(adminDb.collection('administrativeTransactions').doc(), { type: 'Expense', expenseType: 'MARKETER_COMMISSION', amount: -value.amount, staffUserId: data.marketerId, dealId: value.dealId, payoutReference: value.reference, marketingOperationId: value.operationId, description: 'Signed Murabaha marketer commission payment', createdAt: now });
  });
  return { success: true as const };
}

export async function reconcileMarketingReceiptsAction(input: { authToken: string; dealId: string }) {
  const value = z.object({ authToken: z.string().min(1), dealId: id }).parse(input);
  const actor = await verifyAdminWrite(value.authToken);
  await adminDb.runTransaction(async trx => {
    const change = await prepareMarketingReplenishment(trx, { dealId: value.dealId, actorId: actor.uid, reason: 'Reconcile approved receipts, reversals and refunds' });
    change.write();
  });
  return { success: true as const };
}

export async function assignDealMarketerAction(input: { authToken: string; dealId: string; marketerId: string }) {
  const value = z.object({ authToken: z.string().min(1), dealId: id, marketerId: id.or(z.literal('')) }).parse(input);
  const actor = await verifyAdminWrite(value.authToken);
  await adminDb.runTransaction(async trx => {
    const ref = adminDb.doc(`deals/${value.dealId}`);
    const [deal, marketer] = await Promise.all([trx.get(ref), value.marketerId ? trx.get(adminDb.doc(`users/${value.marketerId}`)) : Promise.resolve(null)]);
    if (!deal.exists || (value.marketerId && !hasPersona(marketer?.data(), 'MARKETER'))) throw new Error('Select an existing marketer and deal.');
    if (deal.data()?.marketerId === value.marketerId) return;
    trx.update(ref, { marketerId: value.marketerId });
    trx.create(adminDb.collection('marketingOperations').doc(), { kind: 'ASSIGNMENT', dealId: value.dealId, previousMarketerId: deal.data()?.marketerId || null, marketerId: value.marketerId, actorId: actor.uid, createdAt: Timestamp.now(), reason: 'Client recovery assignment changed; earned commission remains with original marketer.' });
  });
  return { success: true as const };
}
