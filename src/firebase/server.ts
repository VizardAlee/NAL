
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// IMPORTANT: Do not use this in client-side code.
// This is a server-only module.

const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

let serviceAccount: any;
if (serviceAccountString) {
  try {
    // Decode the Base64 string to get the JSON string
    const decodedString = Buffer.from(serviceAccountString, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decodedString);
  } catch (error) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', error);
    serviceAccount = undefined;
  }
}


if (!serviceAccount && process.env.NODE_ENV === 'production') {
  console.warn(
    'FIREBASE_SERVICE_ACCOUNT_KEY is not set or invalid. Firebase Admin SDK will not be initialized in production.'
  );
}

const getFirebaseAdminApp = () => {
  const apps = getApps();
  if (apps.length) {
    return apps[0];
  }

  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set or is invalid. Cannot initialize Firebase Admin SDK.');
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
