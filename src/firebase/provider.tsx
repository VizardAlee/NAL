'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { app, auth, firestore } from './client-instance';  // ← Only imported here
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

type FirebaseContextValue = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
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
  return useContext(FirebaseContext).app;
};
