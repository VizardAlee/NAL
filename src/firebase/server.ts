import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// IMPORTANT: Do not use this in client-side code.
// This is a server-only module.

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : undefined;

if (!serviceAccount && process.env.NODE_ENV === 'production') {
  console.warn(
    'FIREBASE_SERVICE_ACCOUNT_KEY is not set. Firebase Admin SDK will not be initialized in production.'
  );
}

const getFirebaseAdminApp = () => {
  const apps = getApps();
  if (apps.length) {
    return apps[0];
  }

  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set. Cannot initialize Firebase Admin SDK.');
  }
  
  return initializeApp({
    credential: cert(serviceAccount),
  });
};

export function initializeFirebase() {
  const app = getFirebaseAdminApp();
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  return { app, auth, firestore };
}
