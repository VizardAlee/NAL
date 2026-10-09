import { spawnSync } from 'node:child_process';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'demo-nal-acceptance';
if (process.env.GCLOUD_PROJECT !== projectId || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(key => !/^127\.0\.0\.1:\d+$/.test(process.env[key] || ''))) {
  throw new Error('Acceptance tests require isolated loopback emulators; production is forbidden.');
}
async function main() {
const app = initializeApp({ projectId });
const auth = getAuth(app); const db = getFirestore(app);
const roles = [
  ['admin','ADMIN',[], 'Admin'], ['owner','OWNER',[], 'Admin'], ['staff','STAFF',[], 'Admin'],
  ['client','USER',['CLIENT'],'Client'], ['investor','USER',['INVESTOR'],'Investor'],
  ['legal','USER',['LEGAL'],'Legal'], ['recovery','USER',['RECOVERY'],'Recovery'], ['marketer','USER',['MARKETER'],'Marketer'],
] as const;
for (const [id,accessRole,personas,role] of roles) {
  await auth.createUser({ uid:id, email:`${id}@nal.test`, password:'Emulator-only-123!', displayName:`Acceptance ${id}`, emailVerified:true });
  await auth.setCustomUserClaims(id,{accessRole,role,personas});
  await db.collection('users').doc(id).set({name:`Acceptance ${id}`,email:`${id}@nal.test`,role,accessRole,personas,primaryPortal:accessRole==='STAFF'?'admin':id,phoneNumber:'',address:'',bankName:'',bankAccountName:'',bankAccountNumber:'',isMuslim:false});
}
await deleteApp(app);
const env = { ...process.env, NAL_LOCAL_ACCEPTANCE:'true', NEXT_PUBLIC_USE_FIREBASE_EMULATORS:'true', NEXT_PUBLIC_FIREBASE_PROJECT_ID:projectId,
  FIREBASE_PROJECT_ID:projectId, NEXT_PUBLIC_FIREBASE_API_KEY:'demo-acceptance-key', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:`${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:`${projectId}.appspot.com`, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:'1234567890', NEXT_PUBLIC_FIREBASE_APP_ID:'demo-acceptance',
  FINANCIAL_DOCUMENT_AI_ENABLED:'false', CRON_SECRET:'', GOOGLE_GENAI_API_KEY:'', GOOGLE_APPLICATION_CREDENTIALS:'', FIREBASE_SERVICE_ACCOUNT_JSON:'', FIREBASE_CLIENT_EMAIL:'', FIREBASE_PRIVATE_KEY:'' };
const build = spawnSync('npx',['next','build'],{env:{...env,NODE_ENV:'production'},stdio:'inherit'});
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync('npx',['playwright','test','--config','playwright.acceptance.config.ts'],{env:{...env,NODE_ENV:'production'},stdio:'inherit'});
process.exit(result.status ?? 1);
}
main().catch(error => { console.error(error.message); process.exit(1); });
