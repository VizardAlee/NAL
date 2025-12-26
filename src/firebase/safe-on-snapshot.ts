
'use client';

import { onSnapshot, Unsubscribe, DocumentData, Query, DocumentReference } from 'firebase/firestore';

/**
 * A wrapper around Firestore's `onSnapshot` that specifically silences the
 * "permission-denied" error that is thrown on logout. This is a known
 * behavior in the Firebase JS SDK where the error is logged before the
 * user's error handler is called.
 * 
 * @param query The Firestore query or document reference to listen to.
 * @param next A callback to be called every time a new `QuerySnapshot` is available.
 * @param error A callback to be called if any other error occurs.
 * @param complete A callback to be called when the listener is closed.
 * @returns An `unsubscribe` function that can be called to cancel the snapshot listener.
 */
export function safeOnSnapshot<T extends DocumentData>(
  query: Query<T> | DocumentReference<T>,
  next: (snapshot: any) => void,
  error?: (error: any) => void,
  complete?: () => void
): Unsubscribe {
  return onSnapshot(
    query,
    next,
    (err) => {
      // Completely silence the specific logout permission error.
      // This happens when the user signs out and active listeners lose their authentication.
      if (err.code === 'permission-denied') {
        // We do nothing here to prevent the error from propagating to the console or our custom hooks.
        return;
      }
      // For all other errors, call the provided error handler.
      error?.(err);
    },
    complete
  );
}
