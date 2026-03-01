import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin-app';

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
  const retainedPercent = Number(data.retainedPercent ?? 50);
  const distributablePercent = Number(data.distributablePercent ?? 50);
  const totalShares = Number(data.totalShares ?? 0);

  if (retainedPercent < 0 || distributablePercent < 0 || retainedPercent + distributablePercent !== 100) {
    throw new Error('Owner profit policy is invalid: retainedPercent + distributablePercent must equal 100.');
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

  if (!policy) {
    return { success: true, processed: 0, skipped: 0, errors: 0, details: ['Owner policy not set.'] };
  }

  const partners = await getActivePartners(new Date());
  const totalActiveShares = partners.reduce((sum, p) => sum + Number(p.shareUnits || 0), 0);
  if (partners.length === 0 || totalActiveShares <= 0) {
    return { success: true, processed: 0, skipped: 0, errors: 0, details: ['No active ownership partners configured.'] };
  }

  const txSnapshot = await adminDb
    .collection('transactions')
    .where('type', '==', 'PlatformEarning')
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();

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
      await adminDb.runTransaction(async (trx) => {
        const freshTxSnap = await trx.get(txDoc.ref);
        const freshTx = freshTxSnap.data() as any;
        if (!freshTxSnap.exists || freshTx?.ownerAllocationId) {
          return;
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
          return;
        }

        let remainingKobo = distributableKobo;
        const partnerSnapshot: Array<{ userId: string; displayName: string; shareUnits: number; ratio: number; allocatedAmount: number }> = [];

        const sortedPartners = [...partners].sort((a, b) => a.userId.localeCompare(b.userId));

        for (let i = 0; i < sortedPartners.length; i++) {
          const partner = sortedPartners[i]!;
          const shareUnits = Number(partner.shareUnits || 0);
          const ratio = shareUnits / totalActiveShares;
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
      });

      processed += 1;
      details.push(`Allocated owner profit for transaction ${txDoc.id}.`);
    } catch (error: any) {
      errors += 1;
      details.push(`Error for transaction ${txDoc.id}: ${error?.message || 'Unknown error'}`);
    }
  }

  return { success: true, processed, skipped, errors, details };
}
