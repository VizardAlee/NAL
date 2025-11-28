'use client';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// Use the mock config to ensure valid keys are present for initialization.
import { firebaseConfig } from '@/lib/firebase-config';

// --- Single, global Firebase instance ---
let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

/**
 * Initializes Firebase App.
 * This function is idempotent, meaning it can be called multiple times without re-initializing.
 */
function initializeFirebaseApp() {
  const apps = getApps();
  if (apps.length > 0) {
    app = apps[0];
  } else {
    app = initializeApp(firebaseConfig);
  }
  auth = getAuth(app);
  firestore = getFirestore(app);
}

// Initialize on module load
initializeFirebaseApp();


/**
 * Returns the initialized Firebase instances.
 * This is a simple getter function to access the global instances.
 */
export function getFirebase() {
  return { app, auth, firestore };
}

// --- Exports for React components ---
export * from './provider';
export * from './auth/use-user';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
