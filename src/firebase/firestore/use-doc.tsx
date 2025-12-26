
'use client';

import { useState, useEffect } from 'react';
import {
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type FirestoreError,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useUser } from '../auth/use-user';

export function useDoc<T extends DocumentData>(
  ref: DocumentReference<T> | null
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const { user } = useUser();

  useEffect(() => {
    if (!ref) {
      setLoading(false);
      setData(null);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      ref,
      (doc) => {
        if (doc.exists()) {
          setData({ ...doc.data(), id: doc.id } as T);
        } else {
          setData(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        // Silently ignore permission-denied errors when the user is logged out.
        // This is an expected race condition on logout.
        if (err.code === 'permission-denied' && !user) {
          setData(null);
          setLoading(false);
          return;
        }
        
        console.error(err);
        setError(err);
        setLoading(false);

        if (err.code === 'permission-denied' && ref) {
          errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
              path: ref.path,
              operation: 'get',
            })
          );
        }
      }
    );

    return () => unsubscribe();
  }, [ref, user]);

  return { data, loading, error };
}
