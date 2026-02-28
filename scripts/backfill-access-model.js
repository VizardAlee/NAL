const { initializeFirebase } = require('../src/firebase/server-script');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function deriveFromLegacyRole(role) {
  switch (role) {
    case 'Admin':
      return { accessRole: 'ADMIN', personas: [], primaryPortal: 'admin' };
    case 'Investor':
      return { accessRole: 'USER', personas: ['INVESTOR'], primaryPortal: 'investor' };
    case 'Client':
      return { accessRole: 'USER', personas: ['CLIENT'], primaryPortal: 'client' };
    case 'Legal':
      return { accessRole: 'USER', personas: ['LEGAL'], primaryPortal: 'legal' };
    case 'Recovery':
      return { accessRole: 'USER', personas: ['RECOVERY'], primaryPortal: 'recovery' };
    case 'Marketer':
      return { accessRole: 'USER', personas: ['MARKETER'], primaryPortal: 'marketer' };
    default:
      return { accessRole: 'USER', personas: [], primaryPortal: 'client' };
  }
}

async function run() {
  const { app } = initializeFirebase();
  const db = getFirestore(app);
  const usersSnap = await db.collection('users').get();

  let updated = 0;
  let skipped = 0;
  const batch = db.batch();

  usersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (data.accessRole && Array.isArray(data.personas) && data.primaryPortal) {
      skipped += 1;
      return;
    }

    const mapped = deriveFromLegacyRole(data.role);
    batch.set(
      docSnap.ref,
      {
        accessRole: data.accessRole || mapped.accessRole,
        personas: Array.isArray(data.personas) ? data.personas : mapped.personas,
        primaryPortal: data.primaryPortal || mapped.primaryPortal,
        migratedAccessModelAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    updated += 1;
  });

  if (updated > 0) {
    await batch.commit();
  }

  console.log(JSON.stringify({ total: usersSnap.size, updated, skipped }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
