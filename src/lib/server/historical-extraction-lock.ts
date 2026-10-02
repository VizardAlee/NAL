import { FieldValue, Timestamp, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { HistoricalWorkspaceError } from './historical-workspace-result';

export function historicalAnalysisIsRunning(data: FirebaseFirestore.DocumentData, now = Date.now()) {
  const started = data.processingStartedAt instanceof Timestamp ? data.processingStartedAt.toMillis() : 0;
  return data.processingState === 'ANALYZING' && started > 0 && now - started < 10 * 60 * 1000;
}

export async function beginHistoricalExtraction(db: Firestore, ref: DocumentReference, attemptId: string) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HistoricalWorkspaceError('IMPORT_NOT_FOUND', 'This import case no longer exists.');
    const data = snapshot.data()!;
    if (['POSTED', 'POSTING'].includes(data.status)) throw new HistoricalWorkspaceError('IMPORT_READ_ONLY', 'This import is being posted or has already been posted.');
    if (historicalAnalysisIsRunning(data)) throw new HistoricalWorkspaceError('EXTRACTION_RUNNING', 'Extraction is already running. Wait for it to finish before retrying.');
    if (!data.documents?.length) throw new HistoricalWorkspaceError('DOCUMENTS_REQUIRED', 'Upload at least one document before extraction.');
    transaction.update(ref, { processingState: 'ANALYZING', processingAttemptId: attemptId, processingStartedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return data;
  });
}

export async function finishHistoricalExtraction(db: Firestore, ref: DocumentReference, attemptId: string, patch: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (!snapshot.exists || data.processingAttemptId !== attemptId || data.processingState !== 'ANALYZING' || ['POSTED', 'POSTING'].includes(data.status)) throw new HistoricalWorkspaceError('EXTRACTION_SUPERSEDED', 'This extraction was superseded. Reload the current review; no financial records were changed.');
    transaction.update(ref, { ...patch, processingState: 'COMPLETE', extractedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function failHistoricalExtraction(db: Firestore, ref: DocumentReference, attemptId: string) {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (!snapshot.exists || data.processingAttemptId !== attemptId || data.processingState !== 'ANALYZING' || ['POSTED', 'POSTING'].includes(data.status)) return;
    transaction.update(ref, { processingState: 'FAILED', processingError: 'Extraction did not complete. Retry or use manual review.', updatedAt: FieldValue.serverTimestamp() });
  });
}
