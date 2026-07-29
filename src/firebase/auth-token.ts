'use client';

import { auth } from '@/firebase/client-instance';
import { onIdTokenChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';

export async function getRequiredIdToken(): Promise<string> {
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to perform this action.');
  }
  return currentUser.getIdToken();
}

export function useIdToken(): string {
  const [token, setToken] = useState('');
  useEffect(() => {
    if (!auth) return;
    return onIdTokenChanged(auth, (user) => {
      if (!user) {
        setToken('');
        return;
      }
      user.getIdToken().then(setToken).catch(() => setToken(''));
    });
  }, []);
  return token;
}
