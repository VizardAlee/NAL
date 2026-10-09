'use server';

import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { verifyAuthToken } from '@/lib/server/auth';
import { canReadHistoricalDocument } from '@/lib/historical-relationships';

export async function listMyHistoricalDocumentsAction(authToken: string) {
  const decoded = await verifyAuthToken(authToken);
  const snapshots = await Promise.all([
    adminDb.collection('historicalImports').where('postedPartyId', '==', decoded.uid).get(),
    adminDb.collection('historicalImports').where('postedPartyIds','array-contains',decoded.uid).get(),
  ]);
  const cases = [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(doc => [doc.id,doc])).values()];
  const documents = cases.flatMap((item) => {
    const data = item.data();
    if (data.status !== 'POSTED' || data.supersededBy) return [];
    return (data.documents || []).filter((document: { customerVisible?: boolean; recipientUserIds?: string[] }) => canReadHistoricalDocument(document,data.postedPartyId,decoded.uid)).map((document: Record<string, unknown>) => ({
      importId: item.id,
      documentId: document.id,
      originalName: document.originalName,
      contentType: document.contentType,
      asOfDate: data.asOfDate?.toDate?.().toISOString() || null,
    }));
  });
  return { success: true as const, documents };
}

export async function getMyHistoricalDocumentUrlAction(input: { authToken: string; importId: string; documentId: string }) {
  const decoded = await verifyAuthToken(input.authToken);
  const snapshot = await adminDb.collection('historicalImports').doc(input.importId).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.status !== 'POSTED' || data.supersededBy || (data.postedPartyId !== decoded.uid && !data.postedPartyIds?.includes(decoded.uid))) throw new Error('Document not available.');
  const document = (data.documents || []).find((item: { id: string; customerVisible?: boolean; recipientUserIds?: string[] }) => item.id === input.documentId && canReadHistoricalDocument(item,data.postedPartyId,decoded.uid));
  if (!document) throw new Error('Document not available.');
  const [url] = await adminStorageBucket.file(document.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000 });
  return { success: true as const, url };
}
