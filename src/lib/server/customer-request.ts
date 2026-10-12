import { createHash } from 'node:crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';

/** Reserve identical pending submissions atomically, including retries after a lost response. */
export async function createPendingCustomerRequest(db: Firestore, collection: string, uid: string, payload: DocumentData, build: (id: string) => DocumentData = () => payload) {
  const canonical = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)));
  const key = createHash('sha256').update(JSON.stringify({ collection, uid, payload: canonical })).digest('hex');
  const marker = db.collection('customerRequestSubmissions').doc(key);
  return db.runTransaction(async transaction => {
    const previous = await transaction.get(marker);
    if (previous.exists && typeof previous.data()?.requestId === 'string') {
      const existing = await transaction.get(db.collection(collection).doc(previous.data()!.requestId));
      if (existing.exists && existing.data()?.status === 'Pending') return { id: existing.id, created: false };
    }
    const request = db.collection(collection).doc();
    transaction.create(request, { ...build(request.id), status: 'Pending', requestedAt: Timestamp.now() });
    transaction.set(marker, { requestId: request.id, userId: uid, collection, updatedAt: Timestamp.now() });
    return { id: request.id, created: true };
  });
}
