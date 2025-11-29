
import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';

const serviceAccount: ServiceAccount | undefined = process.env.FIREBASE_CLIENT_EMAIL
  ? {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }
  : undefined;

function getAdminApp() {
    if (admin.apps.length) {
        return admin.apps[0]!;
    }
    
    if (!serviceAccount?.projectId) {
        throw new Error('Firebase Admin SDK environment variables are not set.');
    }
    
    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const app = getAdminApp();
export const adminDb = admin.firestore(app);
