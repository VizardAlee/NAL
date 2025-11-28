'use client';

import {
  FirebaseApp,
} from 'firebase/app';
import {
  Auth,
} from 'firebase/auth';
import {
  Firestore,
} from 'firebase/firestore';
import {
  createContext,
  useContext,
  type ReactNode,
  useState,
  useEffect,
} from 'react';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';
import { initializeFirebase } from '.';

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

export function FirebaseProvider({
  children,
}: {
  children: ReactNode;
}) {
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
      {children}
      {state.ready && <FirebaseErrorListener />}
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

export const useFirebaseApp = () => {
    const { app, ready } = useFirebase();
    return ready ? app : null;
}
export const useAuth = () => {
    const { auth, ready } = useFirebase();
    return ready ? auth : null;
}
export const useFirestore = () => {
    const { firestore, ready } = useFirebase();
    return ready ? firestore : null;
}
