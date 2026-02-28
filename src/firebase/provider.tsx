'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { app, auth, firestore } from './client-instance';  // ← Only imported here
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

type FirebaseContextValue = {
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
};

const FirebaseContext = createContext<FirebaseContextValue>({
  app,
  auth,
  firestore,
});

export function FirebaseProvider({ children }: { children: ReactNode }) {
  return (
    <FirebaseContext.Provider value={{ app, auth, firestore }}>
      {children}
      <FirebaseErrorListener />
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => useContext(FirebaseContext);
export const useAuth = () => useContext(FirebaseContext).auth;
export const useFirestore = () => useContext(FirebaseContext).firestore;
export const useFirebaseApp = (): FirebaseApp => {
  const firebaseApp = useContext(FirebaseContext).app;
  if (!firebaseApp) {
    throw new Error('Firebase App is not initialized. Configure NEXT_PUBLIC_FIREBASE_* environment variables.');
  }
  return firebaseApp;
};
