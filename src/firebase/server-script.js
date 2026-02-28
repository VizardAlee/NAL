// This is a separate server initialization for scripts to avoid Next.js module issues.
const admin = require('firebase-admin');

function normalizePrivateKey(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  const unquoted =
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.replace(/\\n/g, '\n');
}

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
      privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  };

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return { app };
}

module.exports = { initializeFirebase };
