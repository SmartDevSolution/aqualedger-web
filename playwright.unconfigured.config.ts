import {defineConfig} from '@playwright/test';

const port = 3101;

// Neither AQUALEDGER_API_BASE_URL nor AQUALEDGER_OPERATOR_JWT is set on the spawned process,
// regardless of the ambient shell environment, so the relay always returns API_NOT_CONFIGURED.
const unconfiguredEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && key !== 'AQUALEDGER_API_BASE_URL' && key !== 'AQUALEDGER_OPERATOR_JWT') {
    unconfiguredEnv[key] = value;
  }
}

export default defineConfig({
  testDir: './tests/e2e-unconfigured',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {name: 'desktop-chromium', use: {viewport: {width: 1365, height: 900}}},
    {name: 'small-width-chromium', use: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}}
  ],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/en/analysis`,
    env: unconfiguredEnv,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
