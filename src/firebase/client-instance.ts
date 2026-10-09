
'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { firebaseConfig } from '@/firebase/config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

if (firebaseConfig && firebaseConfig.projectId) {
    const existingApp = getApps()[0];
    app = existingApp || initializeApp(firebaseConfig);

    auth = getAuth(app);
    firestore = existingApp
      ? getFirestore(app)
      : initializeFirestore(app, {
          // Some proxies, VPNs, antivirus products, and mobile networks buffer
          // Firestore's streaming transport until the SDK reports that it is
          // offline. Long-polling avoids that failure mode.
          experimentalForceLongPolling:
            process.env.NEXT_PUBLIC_FIRESTORE_FORCE_LONG_POLLING !== 'false',
        });

    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && !existingApp) {
      if (!firebaseConfig.projectId.startsWith('demo-')) throw new Error('Emulator mode requires a demo project.');
      if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        throw new Error('Emulator mode is restricted to local acceptance tests.');
      }
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(firestore, '127.0.0.1', 8088);
      connectStorageEmulator(getStorage(app), '127.0.0.1', 9199);
    }

} else {
    console.warn("Firebase config not found. Firebase services are disabled until NEXT_PUBLIC_FIREBASE_* env vars are configured.");
}


export { app, auth, firestore };
