import {expect, test, type Page} from '@playwright/test';

const polygonText = JSON.stringify({
  type: 'Polygon',
  coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]
});

// Without AQUALEDGER_API_BASE_URL / AQUALEDGER_OPERATOR_JWT on the server process, the relay
// itself now surfaces API_NOT_CONFIGURED (the config gate moved server-side with the Council
// DP-2 access model), rather than the browser pre-emptively refusing to call an unset public URL.
// The browser therefore does reach the same-origin route; the route just answers "not configured".

test('missing API URL blocks submission in both locales and the locale choice persists', async ({page}) => {
  const analysisPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/analyses')) analysisPosts.push(request.url());
  });

  await prepareDraft(page, 'en');
  await page.getByLabel('Start date').fill(dateFromToday(-10));
  await page.getByLabel('End date').fill(dateFromToday(-1));
  await page.getByRole('button', {name: 'Run analysis'}).click();
  await expect(page.getByRole('alert').filter({hasText: 'The backend API URL is not configured'})).toBeVisible();

  await page.getByRole('link', {name: 'العربية'}).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('button', {name: 'شغّل التحليل'})).toBeEnabled();
  await page.getByRole('button', {name: 'شغّل التحليل'}).click();
  await expect(page.getByRole('alert').filter({hasText: 'لم يتم إعداد عنوان واجهة API الخلفية لهذا التطبيق.'})).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/ar\/analysis$/);
  expect(analysisPosts).toHaveLength(2);
});

test('a saved ID without an API URL is clearly blocked and is not resubmitted', async ({page}) => {
  const analysisPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/analyses')) analysisPosts.push(request.url());
  });
  await page.goto('/en/analysis/5b4d86a2-8b3e-4e11-9045-bce502aa1a31');
  await expect(page.getByRole('alert').filter({hasText: 'The backend API URL is not configured'})).toBeVisible();
  await expect(page.getByText('The saved analysis could not be loaded. See the execution status above.')).toBeVisible();
  expect(analysisPosts).toEqual([]);
});

test('Settings distinguishes missing backend configuration from an empty source response', async ({page}) => {
  await page.goto('/en/settings');
  await expect(page.getByRole('alert').filter({hasText: 'The backend API URL is not configured'})).toBeVisible();
  await expect(page.getByText('The backend returned no configured source records.')).toHaveCount(0);
  await expect(page.locator('.source-item')).toHaveCount(0);
});

async function prepareDraft(page: Page, locale: 'en' | 'ar') {
  await page.goto(`/${locale}/analysis`);
  await page.locator('.coordinate-entry summary').click();
  await page.getByLabel(locale === 'en' ? 'Polygon GeoJSON' : 'GeoJSON للمضلع').fill(polygonText);
  await page.getByRole('button', {name: locale === 'en' ? 'Use polygon' : 'استخدم المضلع'}).click();
}

function dateFromToday(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
