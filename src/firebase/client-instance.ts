
'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, connectAuthEmulator, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

if (firebaseConfig && firebaseConfig.projectId) {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }

    auth = getAuth(app);
    firestore = getFirestore(app);

} else {
    console.warn("Firebase config not found, using mock instances.");
    // Provide mock instances if config is not available
    app = {} as FirebaseApp;
    auth = {} as Auth;
    firestore = {} as Firestore;
}


export { app, auth, firestore };

