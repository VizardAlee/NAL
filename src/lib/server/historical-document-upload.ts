import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HistoricalWorkspaceError } from './historical-workspace-result';

export const MAX_HISTORICAL_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENTS = 12;
type EvidenceBucket = { file(path: string): {
  save(bytes: Buffer, options: { resumable: false; metadata: { contentType: string } }): Promise<unknown>;
  delete(): Promise<unknown>;
} };

export function historicalDocumentType(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_HISTORICAL_DOCUMENT_BYTES) throw new HistoricalWorkspaceError('INVALID_FILE', 'Upload a document between 1 byte and 5 MB.');
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new HistoricalWorkspaceError('INVALID_FILE', 'This file is not a supported document. Upload a genuine JPG, PNG, WEBP or PDF.');
}

/** The API must verify administrator write access before calling this service. */
export async function storeHistoricalDocument(db: Firestore, bucket: EvidenceBucket, input: { importId: string; adminId: string; originalName: string; bytes: Buffer }) {
  if (![input.importId, input.adminId].every(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw new HistoricalWorkspaceError('INVALID_INPUT', 'The import workspace is invalid. Refresh the migration page and reopen the case.');
  const contentType = historicalDocumentType(input.bytes);
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const ref = db.collection('historicalImports').doc(input.importId);
  const hashRef = db.collection('historicalImportDocumentHashes').doc(sha256);
  const settingRef = db.collection('platformSettings').doc('historicalImports');
  const assertOpen = (data: FirebaseFirestore.DocumentData | undefined, enabled: unknown) => {
    if (enabled === false) throw new HistoricalWorkspaceError('IMPORTS_CLOSED', 'Historical imports are closed. Re-enable imports before adding evidence.');
    if (!data) throw new HistoricalWorkspaceError('IMPORT_NOT_FOUND', 'This import workspace no longer exists. Return to migration cases and reopen it.');
    if (!['DRAFT', 'NEEDS_ATTENTION', 'READY_FOR_REVIEW'].includes(data.status)) throw new HistoricalWorkspaceError('IMPORT_READ_ONLY', 'This import is being posted or has already been posted. Its evidence cannot be changed.');
    if (data.processingState === 'ANALYZING') throw new HistoricalWorkspaceError('IMPORT_BUSY', 'Document extraction is running. Wait for it to finish before adding evidence.');
  };
  // Reject closed/posted workspaces before writing any object.
  const [initial, settings] = await Promise.all([ref.get(), settingRef.get()]);
  assertOpen(initial.data(), settings.data()?.enabled);
  const document = { id: randomUUID(), storagePath: '', originalName: input.originalName.slice(0, 180), contentType, size: input.bytes.length, sha256, uploadedAt: Timestamp.now() };
  document.storagePath = `historical-imports/${input.importId}/${input.adminId}/${document.id}`;
  const file = bucket.file(document.storagePath);
  await file.save(input.bytes, { resumable: false, metadata: { contentType } });
  try {
    const result = await db.runTransaction(async transaction => {
      const [current, setting, hash] = await Promise.all([transaction.get(ref), transaction.get(settingRef), transaction.get(hashRef)]);
      const data = current.data();
      assertOpen(data, setting.data()?.enabled);
      const documents: Array<Record<string, any>> = data!.documents || [];
      if (hash.exists) {
        const existing = documents.find(item => item.sha256 === sha256);
        if (hash.data()?.importId === input.importId && existing) return { duplicate: true, document: existing };
        throw new HistoricalWorkspaceError('DUPLICATE_DOCUMENT', 'This document is already attached to another historical import. Use its existing case instead of importing it twice.');
      }
      if (documents.length >= MAX_DOCUMENTS) throw new HistoricalWorkspaceError('DOCUMENT_LIMIT', 'This import already contains 12 documents. Start another case for additional evidence.');
      transaction.create(hashRef, { importId: input.importId, storagePath: document.storagePath, createdAt: FieldValue.serverTimestamp() });
      transaction.update(ref, { documents: FieldValue.arrayUnion(document), status: 'DRAFT', extraction: null, reconciliationIssues: [], updatedAt: FieldValue.serverTimestamp() });
      return { duplicate: false, document };
    });
    if (result.duplicate) await file.delete();
    return { duplicate: result.duplicate, documentId: result.document.id as string };
  } catch (error) {
    await file.delete().catch(() => console.error('Historical evidence upload cleanup failed.', { documentId: document.id }));
    throw error;
  }
}
