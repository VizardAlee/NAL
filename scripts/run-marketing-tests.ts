import { spawnSync } from 'node:child_process';
const projectId='demo-nal-acceptance';
if(process.env.GCLOUD_PROJECT!==projectId || process.env.K_SERVICE || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'].some(k=>!/^127\.0\.0\.1:\d+$/.test(process.env[k] || ''))) throw new Error('Marketing tests require isolated loopback demo emulators; production forbidden.');
const env={...process.env,NAL_MARKETING_ACCEPTANCE:'true',NEXT_PUBLIC_USE_FIREBASE_EMULATORS:'true',NEXT_PUBLIC_FIREBASE_PROJECT_ID:projectId,FIREBASE_PROJECT_ID:projectId,NEXT_PUBLIC_FIREBASE_API_KEY:'demo-acceptance-key',NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:`${projectId}.firebaseapp.com`,NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:`${projectId}.appspot.com`,NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:'1234567890',NEXT_PUBLIC_FIREBASE_APP_ID:'demo-acceptance',FINANCIAL_DOCUMENT_AI_ENABLED:'false',GOOGLE_GENAI_API_KEY:'',GOOGLE_APPLICATION_CREDENTIALS:'',FIREBASE_CLIENT_EMAIL:'',FIREBASE_PRIVATE_KEY:'',FIREBASE_SERVICE_ACCOUNT_JSON:'',CRON_SECRET:''};
let result=spawnSync('node',['-r','./tests/server-action-context.cjs','--import','tsx','--test','--test-concurrency=1','tests/marketing-fund.integration.ts'],{env,stdio:'inherit'});
if(result.status!==0) process.exit(result.status??1);
if(process.argv.includes('--browser')) {
  if (!process.argv.includes('--reuse-build')) result=spawnSync('npx',['next','build'],{env:{...env,NAL_LOCAL_ACCEPTANCE:'true',NODE_ENV:'production'},stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
  result=spawnSync('npx',['playwright','test','--config','playwright.acceptance.config.ts','marketing-fund.spec.ts'],{env:{...env,NAL_LOCAL_ACCEPTANCE:'true',NODE_ENV:'production'},stdio:'inherit'});
}
process.exit(result.status??1);
