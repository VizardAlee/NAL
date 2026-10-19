import 'server-only';
import { createHash } from 'node:crypto';
import { FieldPath, type Query } from 'firebase-admin/firestore';
import { z } from 'zod';

const cursorSchema = z.object({ v: z.literal(1), scope: z.string(), after: z.string().min(1).max(1500).refine(value => !value.includes('/')) , value: z.string().optional() }).strict();
/** Bounded server scan. Zero matches may still have a continuation. Document ID
 * ordering includes legacy records without timestamps. Cursors confer no access:
 * every request rebuilds its authorized query, and binds cursor to its filters.
 * This is live traversal, not a cross-request snapshot; refresh after mutations.
 */
export async function documentPage(query: Query, scope: unknown[], cursor?: string, predicate: (data: FirebaseFirestore.DocumentData) => boolean = () => true, budget = 100, orderField?: 'date') {
  const key = createHash('sha256').update(JSON.stringify([scope,orderField || null])).digest('hex');
  let ordered = (orderField ? query.orderBy(orderField) : query).orderBy(FieldPath.documentId());
  if (cursor) {
    if (cursor.length > 4000) throw Error('Invalid page cursor.');
    let decoded: z.infer<typeof cursorSchema>;
    try { decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString())); }
    catch { throw Error('Invalid page cursor.'); }
    if (decoded.scope !== key) throw Error('Page filters changed. Start again from the first page.');
    if (orderField && !decoded.value) throw Error('Invalid ordered page cursor.');
    ordered = orderField ? ordered.startAfter(decoded.value,decoded.after) : ordered.startAfter(decoded.after);
  }
  const snapshot = await ordered.limit(budget + 1).get();
  const scanned = snapshot.docs.slice(0, budget);
  const hasMore = snapshot.size > budget;
  return { docs: scanned.filter(doc => predicate(doc.data())), scanned: scanned.length, hasMore,
    nextCursor: hasMore ? Buffer.from(JSON.stringify({ v: 1, scope: key, after: scanned.at(-1)!.id, ...(orderField ? {value:scanned.at(-1)!.get(orderField)} : {}) })).toString('base64url') : null };
}
