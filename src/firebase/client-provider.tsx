
'use client';
import { FirebaseProvider } from './provider';
import { ReactNode } from 'react';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  // The FirebaseProvider now handles its own initialization.
  // We just need to render it.
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
