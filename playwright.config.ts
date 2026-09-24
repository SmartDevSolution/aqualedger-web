import {defineConfig} from '@playwright/test';

const port = 3100;

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
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/en/analysis`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
