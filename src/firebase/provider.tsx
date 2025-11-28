'use client';

import {
  createContext,
  useContext,
  type ReactNode,
  useState,
  useEffect,
} from 'react';
import { initializeFirebase } from '.';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

type FirebaseContextValue = {
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  ready: boolean;
};

const FirebaseContext = createContext<FirebaseContextValue>({
  app: null,
  auth: null,
  firestore: null,
  ready: false,
});

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FirebaseContextValue>({
    app: null,
    auth: null,
    firestore: null,
    ready: false,
  });

  useEffect(() => {
    const { app, auth, firestore } = initializeFirebase();
    setState({ app, auth, firestore, ready: true });
  }, []);

  return (
    <FirebaseContext.Provider value={state}>
      {state.ready ? (
        <>
          {children}
          <FirebaseErrorListener />
        </>
      ) : null}
    </FirebaseContext.Provider>
  );
}

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};

export const useFirebaseApp = (): FirebaseApp | null => {
  const { app, ready } = useFirebase();
  return ready ? app : null;
};
export const useAuth = (): Auth | null => {
  const { auth, ready } = useFirebase();
  return ready ? auth : null;
};
export const useFirestore = (): Firestore | null => {
  const { firestore, ready } = useFirebase();
  return ready ? firestore : null;
};
