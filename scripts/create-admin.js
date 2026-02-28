// This script is used to create the initial admin user from the backend.
// It should be run only once.

const { initializeFirebase } = require('../src/firebase/server-script');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// --- IMPORTANT: SET YOUR ADMIN CREDENTIALS HERE ---
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'strong-password-123';
const ADMIN_NAME = 'Admin User';
// ---------------------------------------------------

async function createAdminUser() {
  if (ADMIN_EMAIL === 'admin@example.com') {
    console.error('*******************************************************************');
    console.error('ERROR: Please edit the admin credentials in scripts/create-admin.js before running.');
    console.error('*******************************************************************');
    process.exit(1);
  }

  console.log(`Attempting to create admin user: ${ADMIN_NAME} (${ADMIN_EMAIL})`);

  try {
    const { app } = initializeFirebase();
    const auth = getAuth(app);
    const firestore = getFirestore(app);

    // 1. Create user in Firebase Authentication
    console.log('1. Creating user in Firebase Auth...');
    const userRecord = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
      emailVerified: true,
      disabled: false,
    });
    console.log(`   -> Successfully created Auth user with UID: ${userRecord.uid}`);

    // 2. Set custom claim for the admin role
    console.log('2. Setting "Admin" custom claim...');
    await auth.setCustomUserClaims(userRecord.uid, {
      role: 'Admin',
      accessRole: 'ADMIN',
      personas: [],
      primaryPortal: 'admin',
    });
    console.log('   -> Custom claim set successfully.');

    // 3. Create user profile in Firestore
    console.log('3. Creating user profile in Firestore...');
    const userDocRef = firestore.collection('users').doc(userRecord.uid);
    await userDocRef.set({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: 'Admin',
      accessRole: 'ADMIN',
      personas: [],
      primaryPortal: 'admin',
    });
    console.log('   -> Firestore profile created successfully.');

    console.log('\n✅ Admin user creation complete!');
    process.exit(0);

  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
        console.error('\n❌ Error: This email address is already in use.');
        console.error('   If you have already created this user, you can ignore this error.');
    } else {
        console.error('\n❌ An unexpected error occurred:');
        console.error(error);
    }
    process.exit(1);
  }
}

createAdminUser();
