import { defineConfig, devices } from '@playwright/test';

if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== 'demo-nal-acceptance' || process.env.NAL_LOCAL_ACCEPTANCE !== 'true') {
  throw new Error('Run authenticated tests through npm run test:acceptance; production is forbidden.');
}
export default defineConfig({
  testDir: './tests/acceptance', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:9011', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 150_000,
  webServer: { command: 'npx next start -p 9011', url: 'http://127.0.0.1:9011', reuseExistingServer: false, timeout: 120_000 },
});
