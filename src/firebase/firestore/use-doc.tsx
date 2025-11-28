'use client';

import { useState, useEffect, useRef } from 'react';
import {
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type FirestoreError,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useDoc<T extends DocumentData>(
  ref: DocumentReference<T> | null
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);

  const docRef = useRef(ref);

  useEffect(() => {
    if (docRef.current?.path !== ref?.path) {
      docRef.current = ref;
    }
  }, [ref]);

  useEffect(() => {
    if (!docRef.current) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      docRef.current,
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

        if (err.code === 'permission-denied' && docRef.current) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: docRef.current.path,
            operation: 'get',
          }));
        }
      }
    );

    return () => unsubscribe();
  }, [docRef.current]);

  return { data, loading, error };
}
