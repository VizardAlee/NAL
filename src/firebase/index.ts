
'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

// Use a function that lazily initializes — no top-level mutation
let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _firestore: Firestore | undefined;

function ensureInitialized(): { app: FirebaseApp; auth: Auth; firestore: Firestore } {
  if (_app) {
    return { app: _app, auth: _auth!, firestore: _firestore! };
  }

  const existingApp = getApps().length ? getApps()[0] : undefined;
  if (existingApp) {
    _app = existingApp;
  } else {
    if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.includes('mock-key')) {
        console.warn("Using mock Firebase configuration. Please set up your environment variables for a real project.");
    }
    _app = initializeApp(firebaseConfig);
  }

  _auth = getAuth(_app);
  _firestore = getFirestore(_app);

  return { app: _app, auth: _auth, firestore: _firestore };
}

// This is now safe to call from anywhere, even at module top level
export function getFirebase() {
  return ensureInitialized();
}

// Re-exports
export * from './provider';
export * from './auth/use-user';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
