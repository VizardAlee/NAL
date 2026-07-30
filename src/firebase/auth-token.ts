'use client';

import { auth } from '@/firebase/client-instance';
import { onIdTokenChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';

export async function getRequiredIdToken(): Promise<string> {
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to perform this action.');
  }

  // Server mutations verify this token with the Admin SDK. Force a refresh so
  // a long-lived browser tab cannot submit an expired or revoked cached token.
  // Firebase still coalesces concurrent refresh requests internally.
  try {
    return await currentUser.getIdToken(true);
  } catch {
    throw new Error('Your session has expired. Please sign out and sign in again.');
  }
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
