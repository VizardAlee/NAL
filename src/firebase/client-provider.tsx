'use client';
import { FirebaseProvider, initializeFirebase } from '.';
import { ReactNode, useMemo } from 'react';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const firebaseApp = useMemo(() => initializeFirebase(), []);

  return <FirebaseProvider {...firebaseApp}>{children}</FirebaseProvider>;
}
