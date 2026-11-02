"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareMarketingReplenishment = prepareMarketingReplenishment;
exports.assertMarketingPoolCurrent = assertMarketingPoolCurrent;
exports.reconcileMarketingReceiptChange = reconcileMarketingReceiptChange;
const marketing_fund_domain_1 = require("./marketing-fund-domain");
/**
 * Prepare reads before writes. New approved receipts can supply their platform cash
 * in the same transaction. Existing fundable platform cash backs late-funding catchup.
 * Reversal deltas may make the pool negative: they never block a valid reversal.
 */
async function prepareMarketingReplenishment(db, trx, input) {
    const ref = db.collection('marketingCommissions').doc(input.dealId);
    const obligationSnap = await trx.get(ref);
    if (!obligationSnap.exists)
        return { incomingUsed: 0, poolDelta: 0, write: () => { } };
    const obligation = obligationSnap.data();
    const [poolSnap, receiptsSnap] = await Promise.all([
        trx.get(db.doc('marketingPools/main')), trx.get(db.collection('repayments').where('dealId', '==', input.dealId)),
    ]);
    const rows = new Map(receiptsSnap.docs.map(d => [d.id, d.data()]));
    if (input.receiptOverride)
        rows.set(input.receiptOverride.id, input.receiptOverride.data);
    // Only contract repayments posted by the existing authorized finance workflow.
    const cleared = (0, marketing_fund_domain_1.netClearedKobo)([...rows.values()]);
    const funded = input.fundedKobo ?? obligation.fundedKobo;
    const desiredTarget = (0, marketing_fund_domain_1.replenishmentTarget)(funded, cleared, obligation.repaymentBasisKobo);
    let delta = desiredTarget - obligation.replenishedKobo;
    const incoming = Math.max(0, input.incomingPlatformKobo || 0);
    const fromIncoming = Math.min(Math.max(0, delta), incoming);
    let needed = Math.max(0, delta - fromIncoming);
    const deductions = [];
    if (needed > 0) {
        const batches = await trx.get(db.collection('fundBatches').where('sourceId', '==', 'platform'));
        for (const batch of batches.docs.sort((a, b) => a.id.localeCompare(b.id))) {
            const data = batch.data();
            // Owner-allocated and earmarked batches must never be spent as marketing money.
            if (data.sourceType === 'OwnerProfitAutoAllocation' || data.marketingReserved)
                continue;
            const remaining = (0, marketing_fund_domain_1.kobo)(Math.max(0, Number(data.remainingAmount || 0)));
            const amount = Math.min(needed, remaining);
            if (amount)
                deductions.push({ ref: batch.ref, amount, remaining });
            needed -= amount;
            if (!needed)
                break;
        }
        if (needed && !input.deferInsufficientCash)
            throw new Error('Insufficient available platform cash to back receipt replenishment. Review the source allocation before recording this commission payment.');
    }
    if (needed)
        delta -= needed;
    const target = obligation.replenishedKobo + delta;
    const pendingKobo = desiredTarget - target;
    const revision = Number(obligation.revision || 0) + 1;
    return { incomingUsed: fromIncoming, poolDelta: delta, write: () => {
            if (delta === 0 && cleared === obligation.netClearedKobo && funded === obligation.fundedKobo)
                return;
            const now = new Date();
            trx.update(ref, { fundedKobo: funded, replenishedKobo: target, netClearedKobo: cleared, replenishmentTargetKobo: desiredTarget, pendingReplenishmentKobo: pendingKobo, revision, updatedAt: now });
            if (!delta) {
                if (pendingKobo > 0)
                    trx.create(ref.collection('events').doc(`pending-${revision}`), { kind: 'REPLENISHMENT_PENDING', desiredTargetKobo: desiredTarget, pendingKobo, actorId: input.actorId, reason: input.reason, createdAt: now });
                return;
            }
            for (const row of deductions)
                trx.update(row.ref, { remainingAmount: (row.remaining - row.amount) / 100 });
            if (delta < 0)
                trx.create(db.collection('fundBatches').doc(), {
                    sourceId: 'platform', amount: -delta / 100, remainingAmount: -delta / 100, createdAt: now,
                    tenureValue: 10, tenureUnit: 'Years', marketingAdjustment: true, dealId: input.dealId,
                });
            trx.set(db.doc('marketingPools/main'), { balanceKobo: Number(poolSnap.data()?.balanceKobo || 0) + delta, updatedAt: now }, { merge: true });
            trx.create(ref.collection('events').doc(`replenishment-${revision}`), {
                kind: 'REPLENISHMENT', deltaKobo: delta, targetKobo: target, desiredTargetKobo: desiredTarget, pendingKobo, netClearedKobo: cleared, fundedKobo: funded,
                actorId: input.actorId, reason: input.reason, createdAt: now,
            });
            trx.create(db.collection('administrativeTransactions').doc(), {
                type: delta > 0 ? 'TransferFromInvestible' : 'TransferToInvestible', amount: delta / 100,
                description: `Marketing pool allocation adjustment: ${input.reason}`, marketingInternalAllocation: true,
                dealId: input.dealId, createdAt: now,
            });
        } };
}
/** Spending is forbidden while any paid commission's receipt allocation is stale. */
async function assertMarketingPoolCurrent(db, trx) {
    const obligations = await trx.get(db.collection('marketingCommissions').where('fundedKobo', '>', 0));
    for (const obligation of obligations.docs) {
        const data = obligation.data();
        const receipts = await trx.get(db.collection('repayments').where('dealId', '==', obligation.id));
        const target = (0, marketing_fund_domain_1.replenishmentTarget)(data.fundedKobo, (0, marketing_fund_domain_1.netClearedKobo)(receipts.docs.map(d => d.data())), data.repaymentBasisKobo);
        if (target !== data.replenishedKobo)
            throw new Error('Receipt reconciliation is pending. Commission payments are paused until the marketing pool reflects all cleared receipts, reversals and refunds.');
    }
}
/** Current-state recomputation makes retries, delayed events and duplicate deliveries safe. */
async function reconcileMarketingReceiptChange(db, before, after, eventId) {
    const deals = [...new Set([before?.dealId, after?.dealId].filter((id) => typeof id === 'string' && !!id))];
    for (const dealId of deals)
        await db.runTransaction(async (trx) => {
            const change = await prepareMarketingReplenishment(db, trx, { dealId, actorId: 'receipt-change-trigger', reason: `Receipt change ${eventId}` });
            change.write();
        });
}
//# sourceMappingURL=marketing-fund-core.js.map