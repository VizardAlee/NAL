
'use client';

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import { getFirebase } from '.';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

type FirebaseContextValue = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
};

// Call getFirebase to initialize and get the instances.
const { app, auth, firestore } = getFirebase();

// The context can be created with the initialized instances.
const FirebaseContext = createContext<FirebaseContextValue>({
  app,
  auth,
  firestore,
});

/**
 * A simple provider that makes the initialized Firebase instances
 * available to the entire React component tree.
 */
export function FirebaseProvider({ children }: { children: ReactNode }) {
  // The value is stable because getFirebase() is idempotent.
  const value = { app, auth, firestore };
  return (
    <FirebaseContext.Provider value={value}>
      {children}
      <FirebaseErrorListener />
    </FirebaseContext.Provider>
  );
}

// --- Hooks to access the instances ---
export const useFirebase = (): FirebaseContextValue => {
  return useContext(FirebaseContext);
};

export const useFirebaseApp = (): FirebaseApp => {
  return useContext(FirebaseContext).app;
};
export const useAuth = (): Auth => {
  return useContext(FirebaseContext).auth;
};
export const useFirestore = (): Firestore => {
  return useContext(FirebaseContext).firestore;
};
