// This is a separate server initialization for scripts to avoid Next.js module issues.
const admin = require('firebase-admin');

// IMPORTANT: Do not use this in client-side code.
function initializeFirebase() {
  if (admin.apps.length) {
    return { app: admin.app() };
  }
  
  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('Required Firebase environment variables are not set.');
  }

  const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return { app };
}

module.exports = { initializeFirebase };
