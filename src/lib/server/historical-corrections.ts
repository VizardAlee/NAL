import { Timestamp, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { HistoricalWorkspaceError } from './historical-workspace-result';

class CorrectionError extends HistoricalWorkspaceError {
  constructor(message:string) { super('CORRECTION_BLOCKED',message); }
}

export type HistoricalWrite = { ref: DocumentReference; data: FirebaseFirestore.DocumentData; update?: boolean };

export function assertHistoricalCorrectionApproval(requestedBy: string, approvedBy: string, reason: string, evidence: string) {
  if (!reason.trim() || !evidence.trim()) throw new CorrectionError('A correction requires a reason and identified supporting evidence.');
  if (!requestedBy || requestedBy === approvedBy) throw new CorrectionError('A different administrator must approve this financial correction.');
}

// Immutable ledger entries are offset, not erased. Keep the original earned date
// so reversing profit cannot accidentally change withdrawal-release windows.
export function historicalReversal(data: FirebaseFirestore.DocumentData, correctionId: string, originalPath: string, actor: string) {
  return { ...data, amount: -Number(data.amount), historicalImportId: correctionId, historicalCorrection: true, reversesPath: originalPath, correctionApprovedBy: actor, correctionRecordedAt: Timestamp.now() };
}

export async function commitHistoricalWrites(db: Firestore, writes: HistoricalWrite[], input: { importId: string; sourceId?: string; actor: string }) {
  await db.runTransaction(async transaction => {
    const currentRef = db.collection('historicalImports').doc(input.importId);
    const current = await transaction.get(currentRef);
    if (current.data()?.status !== 'POSTING' || current.data()?.postingStartedBy !== input.actor) throw new CorrectionError('Posting lock changed. Reload the case before retrying.');
    const reversals: HistoricalWrite[] = [];
    const rootId = current.data()?.correctionRootId || input.importId;
    const claims: HistoricalWrite[] = [];
    for (const write of writes.filter(write => ['transactions','fundBatches'].includes(write.ref.parent.id) && write.data.paymentReference)) {
      const reference = String(write.data.paymentReference).trim().toUpperCase();
      if (!reference) continue;
      const ref = db.collection('historicalTransactionReferences').doc(createHash('sha256').update(reference).digest('hex'));
      const claim = await transaction.get(ref);
      if (claim.exists && claim.data()?.rootImportId !== rootId) throw new CorrectionError(`Reference ${reference} has already been posted by another historical import.`);
      for (const receiptReference of [...new Set([String(write.data.paymentReference).trim(),reference])]) {
        const liveReceipts = await transaction.get(db.collection('paymentReceipts').where('fields.reference','==',receiptReference).limit(100));
        if (liveReceipts.size >= 100 || liveReceipts.docs.some(doc => doc.data().status === 'POSTED')) throw new CorrectionError(`Reference ${reference} was already credited through receipt reconciliation. Link the existing records instead of importing it again.`);
      }
      const alreadyClaimed = claims.find(item => item.ref.path === ref.path);
      if (alreadyClaimed) {
        // A contract may quote the same reference as its own dated deposit.
        // It is descriptive, not a second transaction.
        if (write.ref.parent.id === 'fundBatches' && writes.some(item => item.ref.path === alreadyClaimed.data.transactionPath && item.data.type === 'Deposit' && item.data.fundBatchId === write.ref.id)) continue;
        throw new CorrectionError('A bank reference is credited more than once in this posting.');
      }
      claims.push({ref,data:{rootImportId:rootId,latestImportId:input.importId,transactionPath:write.ref.path,updatedAt:Timestamp.now()}});
    }
    if (input.sourceId) {
      const source = await transaction.get(db.collection('historicalImports').doc(input.sourceId));
      const data = source.data() || {};
      if (data.status !== 'POSTED' || data.supersededBy) throw new CorrectionError('The original review was already corrected or is not posted.');
      assertHistoricalCorrectionApproval(current.data()?.correctionRequestedBy, input.actor, current.data()?.correctionReason || '', current.data()?.correctionEvidence || '');
      const original = await Promise.all(['transactions','repayments','administrativeTransactions'].map(collection => transaction.get(db.collection(collection).where('historicalImportId','==',input.sourceId))));
      const userIds = [...new Set([...writes.filter(write => write.ref.parent.id === 'transactions').map(write => write.data.userId),...original[0].docs.map(doc => doc.data().userId)].filter(id => id && id !== 'platform'))];
      if (userIds.length > 20) throw new CorrectionError('This correction is too large for safe review.');
      // Fail closed on any subsequent customer activity, including pending requests.
      for (const userId of userIds) {
        const activity = await transaction.get(db.collection('transactions').where('userId','==',userId).limit(500));
        if (activity.size >= 500 || activity.docs.some(doc => doc.data().historicalImportId !== input.sourceId && (!doc.data().createdAt?.toMillis || doc.data().createdAt.toMillis() >= data.postedAt?.toMillis?.()))) throw new CorrectionError('Newer financial activity exists. This correction needs a targeted adjustment, not replacement of the opening balances.');
        for (const collection of ['withdrawalRequests','depositRequests']) {
          for (const ownerField of ['userId','investorId']) {
            const requests = await transaction.get(db.collection(collection).where(ownerField,'==',userId).limit(100));
            if (requests.size >= 100 || requests.docs.some(doc => doc.data().status === 'Pending' || (doc.data().status === 'Approved' && (!doc.data().createdAt?.toMillis || doc.data().createdAt.toMillis() >= data.postedAt?.toMillis?.())))) throw new CorrectionError('Newer financial requests exist. Resolve them using targeted adjustments before correcting this import.');
          }
        }
      }
      for (const write of writes.filter(write => ['deals','fundBatches','investments'].includes(write.ref.parent.id))) {
        const existing = await transaction.get(write.ref);
        if (existing.exists && existing.data()?.historicalImportId !== input.sourceId) throw new CorrectionError('An operational record changed since the original import.');
        if (write.ref.parent.id === 'deals') {
          const dealIndex = writes.filter(item => item.ref.parent.id === 'deals').findIndex(item => item.ref.path === write.ref.path);
          const oldDeal = data.extraction?.deals?.[dealIndex];
          const live = existing.data();
          if (live && (!oldDeal || live.repaymentPlan || ['principal','profitRate','durationValue','durationUnit','repaymentFrequency'].some(field => live[field] !== oldDeal[field]) || live.status !== (oldDeal.state === 'COMPLETED' ? 'Completed' : 'Active'))) throw new CorrectionError('The live deal terms changed after migration. Use a targeted adjustment.');
          const repayments = await transaction.get(db.collection('repayments').where('dealId','==',write.ref.id).limit(500));
          if (repayments.size >= 500 || repayments.docs.some(doc => ['Approved','Pending'].includes(doc.data().status) && doc.data().historicalImportId !== input.sourceId)) throw new CorrectionError('This deal has newer repayments. Use a targeted adjustment.');
          if (existing.data()?.agreementSigningRequired || existing.data()?.agreementSigningWaived === false) throw new CorrectionError('A new agreement workflow is attached to this deal. Use a targeted adjustment.');
        }
        if (write.ref.parent.id === 'fundBatches' && existing.exists) {
          const oldPosition = (data.extraction?.fundPositions || []).find((position: any, index: number) => index === writes.filter(item => item.ref.parent.id === 'fundBatches').findIndex(item => item.ref.path === write.ref.path));
          if (!oldPosition || Math.abs(Number(existing.data()?.remainingAmount) - Number(oldPosition.availableCapital)) > 0.01) throw new CorrectionError('This fund balance has changed since posting. Use a targeted adjustment.');
        }
      }
      for (const [index, snapshot] of original.entries()) for (const doc of snapshot.docs) {
        // Earlier offsets must stay in place. Reversing an offset on a second
        // correction would resurrect the first version's financial amount.
        if (doc.data().historicalCorrection && doc.data().reversesPath) continue;
        if (index === 1) reversals.push({ref:doc.ref,data:{status:'Reversed',reversedBy:input.actor,reversedAt:Timestamp.now(),historicalCorrectionId:input.importId},update:true});
        else reversals.push({ref:doc.ref.parent.doc(`${input.importId}_reverse_${doc.id}`),data:historicalReversal(doc.data(),input.importId,doc.ref.path,input.actor)});
      }
      // Changing the set of deals/contracts requires targeted adjustments; never
      // leave an old active deal behind when a revised extraction removes it.
      for (const collection of ['deals','fundBatches','investments']) {
        const oldRecords = await transaction.get(db.collection(collection).where('historicalImportId','==',input.sourceId));
        if (oldRecords.docs.some(doc => !writes.some(write => write.ref.path === doc.ref.path))) throw new CorrectionError('Do not remove posted deals or contracts. Use an explicit closure/targeted adjustment.');
      }
      reversals.push({ref:source.ref,data:{supersededBy:input.importId,correctionApprovedBy:input.actor,correctionApprovedAt:Timestamp.now()},update:true});
    }
    if (writes.length + reversals.length + claims.length > 450) throw new CorrectionError('Too many entries for one atomic posting/correction.');
    for (const write of [...reversals,...claims,...writes]) {
      if (write.update) transaction.update(write.ref,write.data);
      else transaction.set(write.ref,write.data);
    }
  });
}
