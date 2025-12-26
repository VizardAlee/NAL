
'use client';

import { useState, useEffect } from 'react';
import {
  type DocumentData,
  type DocumentReference,
  type FirestoreError,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useUser } from '../auth/use-user';
import { safeOnSnapshot } from '../safe-on-snapshot';

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

    const unsubscribe = safeOnSnapshot(
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
