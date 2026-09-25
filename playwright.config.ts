import {defineConfig} from '@playwright/test';
import {TEST_OPERATOR_TOKEN} from './tests/fixtures/backend-double';

const port = 3100;
const backendDoublePort = 3199;
const backendDoubleUrl = `http://127.0.0.1:${backendDoublePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {viewport: {width: 1365, height: 900}}
    },
    {
      name: 'small-width-chromium',
      use: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}
    }
  ],
  // Two servers: the labelled-double backend, and the app pointed at it via the server-only
  // Council DP-2 env (AQUALEDGER_API_BASE_URL / AQUALEDGER_OPERATOR_JWT). The browser never sees
  // either variable; only the `next start` process reads them, inside route handlers.
  webServer: [
    {
      name: 'backend-double',
      command: `node tests/fixtures/run-backend-double.mjs`,
      url: `${backendDoubleUrl}/sources`,
      env: {...process.env, BACKEND_DOUBLE_PORT: String(backendDoublePort)},
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      name: 'web-app',
      command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}/en/analysis`,
      env: {...process.env, AQUALEDGER_API_BASE_URL: backendDoubleUrl, AQUALEDGER_OPERATOR_JWT: TEST_OPERATOR_TOKEN},
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
