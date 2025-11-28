'use client';

import { useState, useEffect, useRef } from 'react';
import {
  onSnapshot,
  query,
  collection,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  doc,
  getDoc,
  type DocumentData,
  type Query,
  type CollectionReference,
  type FirestoreError,
} from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


interface UseCollectionOptions {
  // Define any options here, e.g., for pagination
}

export function useCollection<T extends DocumentData>(
  q: Query<T> | null,
  options?: UseCollectionOptions
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
    if (!queryRef.current) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      queryRef.current,
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
            path: (queryRef.current as CollectionReference).path,
            operation: 'list'
          }));
        }
      }
    );

    return () => unsubscribe();
  }, [queryRef.current]);

  return { data, loading, error };
}
