import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';
import { assertValidOwnerConfiguration } from '@/lib/owner-accounting';

type OwnerProfitPolicy = {
  retainedPercent: number;
  distributablePercent: number;
  totalShares: number;
  allocationStartDate?: Timestamp;
};

type OwnerPartner = {
  userId: string;
  displayName: string;
  shareUnits: number;
  active: boolean;
  effectiveFrom?: Timestamp;
  effectiveTo?: Timestamp;
};

type ProcessOptions = {
  fromDate?: Date;
  toDate?: Date;
  includeHistorical?: boolean;
  limit?: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

async function getPolicy(): Promise<OwnerProfitPolicy | null> {
  const snap = await adminDb.collection('platformPolicies').doc('ownerProfit').get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<OwnerProfitPolicy>;
  const retainedPercent = Number(data.retainedPercent);
  const distributablePercent = Number(data.distributablePercent);
  const totalShares = Number(data.totalShares ?? 0);

  if (retainedPercent < 0 || distributablePercent < 0 || retainedPercent + distributablePercent !== 100) {
    throw new Error('Owner profit policy is invalid: retainedPercent + distributablePercent must equal 100.');
  }
  if (!Number.isInteger(totalShares) || totalShares <= 0) {
    throw new Error('Owner profit policy is invalid: totalShares must be a positive whole number.');
  }

  return {
    retainedPercent,
    distributablePercent,
    totalShares,
    allocationStartDate: data.allocationStartDate,
  };
}

async function getActivePartners(now: Date): Promise<OwnerPartner[]> {
  const snap = await adminDb
    .collection('ownershipPartners')
    .where('active', '==', true)
    .get();

  const nowMs = now.getTime();
  return snap.docs
    .map((doc) => ({ ...(doc.data() as OwnerPartner) }))
    .filter((partner) => {
      const from = partner.effectiveFrom?.toDate().getTime();
      const to = partner.effectiveTo?.toDate().getTime();
      const afterFrom = from == null || nowMs >= from;
      const beforeTo = to == null || nowMs <= to;
      return afterFrom && beforeTo && Number(partner.shareUnits) > 0;
    });
}

export async function processOwnerProfitAllocations(options: ProcessOptions = {}) {
  const { fromDate, toDate, includeHistorical = false, limit = 200 } = options;
  const policy = await getPolicy();

  if (!policy) throw new Error('Owner profit policy is not configured. Allocation has been stopped.');

  const partners = await getActivePartners(new Date());
  const totalActiveShares = partners.reduce((sum, p) => sum + Number(p.shareUnits || 0), 0);
  if (partners.length === 0 || totalActiveShares <= 0) {
    throw new Error('No active ownership partners are configured. Allocation has been stopped.');
  }
  assertValidOwnerConfiguration({
    totalShares: policy.totalShares,
    retainedPercent: policy.retainedPercent,
    distributablePercent: policy.distributablePercent,
    activeShareUnits: partners.map((partner) => Number(partner.shareUnits)),
  });

  let earningsQuery = adminDb.collection('transactions').where('type', '==', 'PlatformEarning');
  // New operating earnings are born with ownerAllocationId: null. Querying that
  // state prevents already processed history from permanently occupying the
  // first page and starving later earnings.
  if (!includeHistorical) earningsQuery = earningsQuery.where('ownerAllocationId', '==', null);
  const txSnapshot = await earningsQuery.orderBy('createdAt', 'asc').limit(limit).get();

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const details: string[] = [];

  for (const txDoc of txSnapshot.docs) {
    const tx = txDoc.data() as any;

    try {
      const amount = Number(tx.amount || 0);
      const txCreatedAt = tx.createdAt as Timestamp | undefined;
      if (!txCreatedAt || !Number.isFinite(amount)) {
        skipped += 1;
        continue;
      }
      if (amount <= 0) {
        skipped += 1;
        continue;
      }
      if (tx.ownerAllocatable === false) {
        skipped += 1;
        continue;
      }
      if (tx.ownerAllocationId) {
        skipped += 1;
        continue;
      }

      const txDate = txCreatedAt.toDate();
      if (fromDate && txDate < fromDate) {
        skipped += 1;
        continue;
      }
      if (toDate && txDate > toDate) {
        skipped += 1;
        continue;
      }
      if (!includeHistorical && policy.allocationStartDate && txDate < policy.allocationStartDate.toDate()) {
        skipped += 1;
        continue;
      }

      const distributable = round2((amount * policy.distributablePercent) / 100);
      const retained = round2(amount - distributable);
      const distributableKobo = Math.max(0, Math.round(distributable * 100));

      const allocationId = `tx_${txDoc.id}`;
      const allocated = await adminDb.runTransaction(async (trx) => {
        const freshTxSnap = await trx.get(txDoc.ref);
        const freshTx = freshTxSnap.data() as any;
        if (!freshTxSnap.exists || freshTx?.ownerAllocationId) {
          return false;
        }

        const allocationRef = adminDb.collection('ownerProfitAllocations').doc(allocationId);
        const existingAllocation = await trx.get(allocationRef);
        if (existingAllocation.exists) {
          trx.update(txDoc.ref, {
            ownerAllocationId: allocationId,
            ownerAllocationProcessedAt: FieldValue.serverTimestamp(),
            retainedAmount: retained,
            distributableAmount: distributable,
          });
          return false;
        }

        // Platform earnings already have cash batches. Transfer that availability
        // in the same transaction as the owner credits; a ledger adjustment alone
        // would leave the same cash available to fund deals twice.
        const platformCash = distributableKobo > 0
          ? await trx.get(adminDb.collection('fundBatches').where('sourceId', '==', 'platform'))
          : null;
        const availableBatches = (platformCash?.docs || [])
          .filter((doc) => Number(doc.data().remainingAmount) > 0)
          .sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0) || a.id.localeCompare(b.id));
        let cashToTransfer = distributableKobo;
        const platformCashDeductions: Array<{ fundBatchId: string; amount: number }> = [];
        for (const batch of availableBatches) {
          if (cashToTransfer <= 0) break;
          const availableKobo = Math.round(Number(batch.data().remainingAmount) * 100);
          if (!Number.isSafeInteger(availableKobo)) throw new Error('Invalid platform cash balance; allocation stopped.');
          const deductedKobo = Math.min(availableKobo, cashToTransfer);
          platformCashDeductions.push({ fundBatchId: batch.id, amount: deductedKobo / 100 });
          cashToTransfer -= deductedKobo;
        }
        if (cashToTransfer > 0) throw new Error('Insufficient available platform cash for owner allocation; allocation remains pending.');
        for (const deduction of platformCashDeductions) {
          trx.update(adminDb.collection('fundBatches').doc(deduction.fundBatchId), {
            remainingAmount: round2(Number(platformCash!.docs.find((doc) => doc.id === deduction.fundBatchId)!.data().remainingAmount) - deduction.amount),
          });
        }

        let remainingKobo = distributableKobo;
        const partnerSnapshot: Array<{ userId: string; displayName: string; shareUnits: number; ratio: number; allocatedAmount: number }> = [];

        const sortedPartners = [...partners].sort((a, b) => a.userId.localeCompare(b.userId));

        for (let i = 0; i < sortedPartners.length; i++) {
          const partner = sortedPartners[i]!;
          const shareUnits = Number(partner.shareUnits || 0);
          const ratio = shareUnits / policy.totalShares;
          let kobo = 0;

          if (i === sortedPartners.length - 1) {
            kobo = remainingKobo;
          } else {
            kobo = Math.floor(distributableKobo * ratio);
            remainingKobo -= kobo;
          }

          const allocatedAmount = round2(kobo / 100);
          if (allocatedAmount <= 0) {
            partnerSnapshot.push({
              userId: partner.userId,
              displayName: partner.displayName,
              shareUnits,
              ratio,
              allocatedAmount: 0,
            });
            continue;
          }

          const fundBatchRef = adminDb.collection('fundBatches').doc();
          trx.set(fundBatchRef, {
            sourceId: partner.userId,
            amount: allocatedAmount,
            remainingAmount: allocatedAmount,
            tenureValue: 10,
            tenureUnit: 'Years',
            createdAt: txCreatedAt,
            sourceType: 'OwnerProfitAutoAllocation',
            allocationId,
            details: `Owner profit allocation from platform earning ${txDoc.id}`,
          });

          const partnerTxRef = adminDb.collection('transactions').doc();
          trx.set(partnerTxRef, {
            userId: partner.userId,
            type: 'Deposit',
            amount: allocatedAmount,
            createdAt: txCreatedAt,
            details: `Owner profit allocation (${allocationId})`,
            ownerAllocatable: false,
            ownerAllocationId: allocationId,
            sourceType: 'OwnerProfitAutoAllocation',
          });

          partnerSnapshot.push({
            userId: partner.userId,
            displayName: partner.displayName,
            shareUnits,
            ratio,
            allocatedAmount,
          });
        }

        if (distributable > 0) {
          const distributionTxRef = adminDb.collection('transactions').doc();
          trx.set(distributionTxRef, {
            userId: 'platform',
            type: 'PlatformEarning',
            amount: -Math.abs(distributable),
            createdAt: txCreatedAt,
            details: `Owner profit distribution for source earning ${txDoc.id}`,
            ownerAllocatable: false,
            ownerAllocationId: allocationId,
            platformEarningKind: 'OwnerDistributionAdjustment',
          });
        }

        trx.set(allocationRef, {
          sourceTransactionId: txDoc.id,
          platformCashDeductions,
          sourceEarningAmount: amount,
          retainedAmount: retained,
          distributableAmount: distributable,
          policySnapshot: {
            retainedPercent: policy.retainedPercent,
            distributablePercent: policy.distributablePercent,
            totalShares: policy.totalShares,
          },
          partnerSnapshot,
          status: 'Completed',
          createdAt: FieldValue.serverTimestamp(),
          sourceCreatedAt: txCreatedAt,
          includeHistorical,
        });

        trx.update(txDoc.ref, {
          ownerAllocationId: allocationId,
          ownerAllocationProcessedAt: FieldValue.serverTimestamp(),
          retainedAmount: retained,
          distributableAmount: distributable,
        });
        return true;
      });

      if (allocated) {
        processed += 1;
        details.push(`Allocated owner profit for transaction ${txDoc.id}.`);
      } else {
        skipped += 1;
      }
    } catch (error: any) {
      errors += 1;
      details.push(`Error for transaction ${txDoc.id}: ${error?.message || 'Unknown error'}`);
    }
  }

  return { success: true, processed, skipped, errors, details };
}
