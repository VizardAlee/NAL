
import { getApps, initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// IMPORTANT: Do not use this in client-side code.
// This is a server-only module.

const serviceAccount: ServiceAccount | undefined = process.env.FIREBASE_CLIENT_EMAIL
  ? {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The private key needs to be parsed correctly, replacing the literal \\n with newlines.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }
  : undefined;


if (!serviceAccount?.projectId && process.env.NODE_ENV === 'production') {
  console.warn(
    'Firebase Admin SDK environment variables are not set or are invalid. SDK will not be initialized in production.'
  );
}

const getFirebaseAdminApp = () => {
  const apps = getApps();
  if (apps.length) {
    return apps[0];
  }

  if (!serviceAccount?.projectId) {
    throw new Error('Firebase Admin SDK environment variables are not set or are invalid. Cannot initialize Firebase Admin SDK.');
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
