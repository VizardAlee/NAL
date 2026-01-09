
import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';

// This configuration is now more robust, checking for the existence of credentials
// and ensuring the private key's newlines are correctly parsed.
const serviceAccount: ServiceAccount | undefined = process.env.FIREBASE_CLIENT_EMAIL
  ? {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }
  : undefined;

// This function ensures the Firebase Admin app is initialized only once,
// which is crucial in a serverless environment like Next.js.
function getAdminApp() {
    // If the app is already initialized, return the existing instance.
    if (admin.apps.length > 0) {
        return admin.apps[0]!;
    }
    
    // Validate that the necessary environment variables are set.
    if (!serviceAccount?.projectId) {
        throw new Error('Firebase Admin SDK environment variables are not set. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are configured.');
    }
    
    // Initialize the app with the service account credentials.
    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

// Export a single, initialized instance of the Firestore database and the app itself.
const app = getAdminApp();
export const adminDb = admin.firestore(app);
adminDb.app = app; // Attach app to db instance
