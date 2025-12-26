
'use client';

import { useState, useEffect } from 'react';
import {
  type Query,
  type DocumentData,
  type FirestoreError,
  type CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useUser } from '../auth/use-user';
import { safeOnSnapshot } from '../safe-on-snapshot';

// Make setData available to consumers of the hook
export function useCollection<T extends DocumentData>(
  q: Query<T> | CollectionReference<T> | null | undefined
) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const { user, loading: authLoading } = useUser();

  useEffect(() => {
    // If the query is null or auth is still loading, don't proceed.
    if (!q || authLoading) {
      setLoading(false);
      setData(null);
      return;
    }

    // If auth is done and there's no user, we can stop.
    if (!authLoading && !user) {
      setLoading(false);
      setData(null);
      return;
    }

    // At this point, we have a query and an authenticated user.
    setLoading(true);

    const unsubscribe = safeOnSnapshot(
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
        if (err.code === 'permission-denied' && q && 'path' in q) {
          const path = (q as any).path || 'unknown';
          errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path,
              operation: 'list',
            })
          );
        }
        setError(err);
        setLoading(false);
      }
    );

    // This cleanup function will run when the component unmounts
    // or when the query or user changes.
    return () => unsubscribe();
  }, [q, user, authLoading]); // Add user and authLoading to the dependency array

  return { data, loading, error, setData };
}
