'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

export function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (error: Error) => {
      // In development, Next.js's error overlay will catch this.
      // In production, you might want to log this to a service.
      if (process.env.NODE_ENV === 'development') {
        throw error;
      } else {
        console.error('Caught a Firebase permission error:', error);
      }
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  return null; // This component doesn't render anything
}
