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
} from 'react';

type FirebaseContextValue = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
};

const FirebaseContext = createContext<FirebaseContextValue | undefined>(
  undefined
);

export function FirebaseProvider({
  children,
  app,
  auth,
  firestore,
}: {
  children: ReactNode;
} & FirebaseContextValue) {

  return (
    <FirebaseContext.Provider
      value={{
        app,
        auth,
        firestore,
      }}
    >
      {children}
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

export const useFirebaseApp = () => useFirebase().app;
export const useAuth = () => useFirebase().auth;
export const useFirestore = () => useFirebase().firestore;
