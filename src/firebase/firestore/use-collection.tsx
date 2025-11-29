
'use client';

import { useState, useEffect } from 'react';
import {
  onSnapshot,
  type Query,
  type DocumentData,
  type FirestoreError,
  type CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// Make setData available to consumers of the hook
export function useCollection<T extends DocumentData>(
  q: Query<T> | CollectionReference<T> | null | undefined
) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!q) {
      setLoading(false);
      setData(null); // Set data to null when query is not available
      return;
    }

    // Set loading to true when a new query is provided
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
        console.error('onSnapshot error:', err);
        setError(err);
        setLoading(false);

        if (err.code === 'permission-denied') {
          const path = 'path' in q ? (q as any).path : 'unknown';
          errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path,
              operation: 'list',
            })
          );
        }
      }
    );

    return () => unsubscribe();
  }, [q]); 

  return { data, loading, error, setData };
}
