'use client';

import { useState, useEffect, useRef } from 'react';
import {
  onSnapshot,
  type Query,
  type DocumentData,
  type FirestoreError,
  type CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useCollection<T extends DocumentData>(
  q: Query<T> | CollectionReference<T> | null | undefined,
  options?: any
) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  // Use a ref to store the query to prevent re-subscribing on every render
  const queryRef = useRef(q);

  useEffect(() => {
    // Simple deep comparison for the query object
    if (JSON.stringify(queryRef.current) !== JSON.stringify(q)) {
      queryRef.current = q;
    }
  }, [q]);


  useEffect(() => {
    if (!q) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id } as T)
        );
        setData(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("onSnapshot error:", err);
        setError(err);
        setLoading(false);

        // Emit a custom, more detailed error for permission issues
        if (err.code === 'permission-denied') {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: (q as CollectionReference).path,
            operation: 'list'
          }));
        }
      }
    );

    return () => unsubscribe();
  }, [q]);

  return { data, loading, error };
}
