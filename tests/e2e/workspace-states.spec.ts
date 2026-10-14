import {expect, test} from '@playwright/test';
import {QUEUED_ID} from '../fixtures/backend-double';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

for (const locale of ['en', 'ar'] as const) {
  const labels = (locale === 'en' ? en : ar).workspace;
  for (const [state, key] of [
    ['QUEUED', 'executionQueued'],
    ['RUNNING', 'executionRunning'],
    ['RETRY_WAIT', 'executionRetryWait']
  ] as const) {
    test(`existing ${state} stage remains truthful without progress percentages in ${locale}`, async ({page}) => {
      let posts = 0;
      page.on('request', (request) => { if (request.method() === 'POST') posts += 1; });
      await page.route(`**/api/analyses/${QUEUED_ID}`, async (route) => {
        const response = await route.fetch();
        await route.fulfill({response, json: {...await response.json(), execution_status: state}});
      });
      await page.goto(`/${locale}/analysis/${QUEUED_ID}`);
      await expect(page.locator('.stage-card')).toContainText(labels[key]);
      await expect(page.locator('.stage-card')).not.toContainText(/\d+%/);
      await expect(page.locator('.result-statistics')).toHaveCount(0);
      expect(posts).toBe(0);
    });
  }

  test(`bounded polling times out and retries status without resubmitting in ${locale}`, async ({page}) => {
    let posts = 0;
    page.on('request', (request) => { if (request.method() === 'POST') posts += 1; });
    await page.clock.install();
    await page.goto(`/${locale}/analysis/${QUEUED_ID}`);
    await expect(page.locator('.stage-card')).toContainText(labels.executionQueued);
    await page.clock.fastForward(125_000);
    await expect(page.locator('.stage-card')).toContainText(labels.pollingTimedOut);
    await page.getByRole('button', {name: labels.retryStatus}).click();
    await expect(page.locator('.stage-card')).toContainText(labels.executionQueued);
    expect(posts).toBe(0);
  });
}
