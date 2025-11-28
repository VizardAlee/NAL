
'use client';
import { FirebaseProvider } from '.';
import { ReactNode } from 'react';

export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  // The FirebaseProvider now handles its own initialization via useEffect.
  // We just need to render it.
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
