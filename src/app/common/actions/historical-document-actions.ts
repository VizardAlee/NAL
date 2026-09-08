'use server';

import { adminDb, adminStorageBucket } from '@/firebase/admin-app';
import { verifyAuthToken } from '@/lib/server/auth';

export async function listMyHistoricalDocumentsAction(authToken: string) {
  const decoded = await verifyAuthToken(authToken);
  const snapshot = await adminDb.collection('historicalImports').where('postedPartyId', '==', decoded.uid).get();
  const documents = snapshot.docs.flatMap((item) => {
    const data = item.data();
    if (data.status !== 'POSTED') return [];
    return (data.documents || []).filter((document: { customerVisible?: boolean }) => document.customerVisible === true).map((document: Record<string, unknown>) => ({
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
  if (!snapshot.exists || data?.status !== 'POSTED' || data.postedPartyId !== decoded.uid) throw new Error('Document not available.');
  const document = (data.documents || []).find((item: { id: string; customerVisible?: boolean }) => item.id === input.documentId && item.customerVisible === true);
  if (!document) throw new Error('Document not available.');
  const [url] = await adminStorageBucket.file(document.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000 });
  return { success: true as const, url };
}
