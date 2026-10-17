import { spawnSync } from 'node:child_process';

const projectId = 'demo-nal-acceptance';
if (process.env.GCLOUD_PROJECT !== projectId || process.env.K_SERVICE ||
    ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']
      .some(key => !/^127\.0\.0\.1:\d+$/.test(process.env[key] || ''))) {
  throw new Error('Financial regressions require isolated loopback demo emulators; production is forbidden.');
}
const env = {
  ...process.env,
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true', NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  FIREBASE_PROJECT_ID: projectId, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  FINANCIAL_DOCUMENT_AI_ENABLED: 'false', GOOGLE_GENAI_API_KEY: '', GOOGLE_APPLICATION_CREDENTIALS: '',
  FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '', FIREBASE_SERVICE_ACCOUNT_JSON: '', CRON_SECRET: '',
};
const result = spawnSync('node', ['-r', './tests/server-action-context.cjs', '--import', 'tsx', '--test',
  '--test-concurrency=1', 'tests/financial-positive-simulation.integration.ts', 'tests/review-blockers.integration.ts'], { env, stdio: 'inherit' });
process.exit(result.status ?? 1);
