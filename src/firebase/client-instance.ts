
'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
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

} else {
    console.warn("Firebase config not found. Firebase services are disabled until NEXT_PUBLIC_FIREBASE_* env vars are configured.");
}


export { app, auth, firestore };
