import {expect, test, type Page} from '@playwright/test';
import {CONFLICT_START_DATE, FAILED_ID, QUEUED_ID, SUCCEEDED_ID} from '../fixtures/backend-double';

const doubleBase = 'http://127.0.0.1:3199';
const polygon = {
  type: 'Polygon',
  coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]
};
const polygonText = JSON.stringify(polygon);

async function setSourcesMode(mode: 'default' | 'empty' | 'outage') {
  await fetch(`${doubleBase}/__test__/set-sources-mode`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({mode})
  });
}

async function doubleRequests(): Promise<{path: string; method: string; idempotencyKey: string | null; authorization: string | null}[]> {
  const response = await fetch(`${doubleBase}/__test__/requests`);
  return response.json();
}

test('root enters the English workspace and server markup sets language direction', async ({page}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en\/analysis$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', {level: 1, name: 'Analysis Workspace'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Settings / Data Sources'})).toHaveCount(0);
});

test('Arabic workspace is RTL while map canvas remains LTR', async ({page}) => {
  await page.goto('/ar/analysis');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', {level: 1, name: 'مساحة التحليل'})).toBeVisible();
  await expect(page.locator('.map-canvas-wrap')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('button', {name: 'ارسم مضلع'})).toBeEnabled({timeout: 45_000});
});

test('invalid GeoJSON and reversed dates are explained and cannot be submitted', async ({page}) => {
  await page.goto('/en/analysis');
  await page.locator('.coordinate-entry summary').click();
  await page.getByLabel('Polygon GeoJSON').fill('{');
  await page.getByRole('button', {name: 'Use polygon'}).click();
  await expect(page.getByRole('status').filter({hasText: 'The text is not valid GeoJSON.'})).toBeVisible();

  await page.getByLabel('Polygon GeoJSON').fill(polygonText);
  await page.getByRole('button', {name: 'Use polygon'}).click();
  await page.getByLabel('Start date').fill(dateFromToday(-10));
  await page.getByLabel('End date').fill(dateFromToday(-20));
  await expect(page.getByRole('status').filter({hasText: 'The start date must be on or before the end date.'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Run analysis'})).toBeDisabled();
});

test('a draft persists across locale and browser timezone changes without submitting', async ({page, browser}) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/analyses')) posts.push(request.url());
  });
  await prepareDraft(page, 'en');
  const startDate = dateFromToday(-30);
  const endDate = dateFromToday(-1);
  await page.getByLabel('Start date').fill(startDate);
  await page.getByLabel('End date').fill(endDate);
  await expect(page.getByRole('button', {name: 'Run analysis'})).toBeEnabled();
  await page.getByRole('link', {name: 'العربية'}).click();
  await expect(page).toHaveURL(/\/ar\/analysis$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel('تاريخ البداية')).toHaveValue(startDate);
  await expect(page.getByLabel('تاريخ النهاية')).toHaveValue(endDate);
  expect(posts).toEqual([]);

  const storageValue = await page.evaluate(() => sessionStorage.getItem('aqualedger.workspace-draft.v1'));
  expect(storageValue).not.toBeNull();
  const timezoneContext = await browser.newContext({
    timezoneId: 'Pacific/Honolulu',
    viewport: page.viewportSize() ?? {width: 1365, height: 900}
  });
  await timezoneContext.addInitScript(({key, value}) => {
    if (value) sessionStorage.setItem(key, value);
  }, {key: 'aqualedger.workspace-draft.v1', value: storageValue});
  const timezonePage = await timezoneContext.newPage();
  timezonePage.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/analyses')) posts.push(request.url());
  });
  await timezonePage.goto('/ar/analysis');
  await expect(timezonePage.getByLabel('تاريخ البداية')).toHaveValue(startDate);
  await expect(timezonePage.getByLabel('تاريخ النهاية')).toHaveValue(endDate);
  expect(await timezonePage.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Pacific/Honolulu');
  expect(posts).toEqual([]);
  await timezoneContext.close();
});

test('explicit submission sends a same-origin keyed request with no browser-held Authorization, loads the saved result, and survives locale switching', async ({page}) => {
  const browserRequests: {method: string; pathname: string; authorization: string | undefined}[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/')) {
      browserRequests.push({method: request.method(), pathname, authorization: request.headers()['authorization']});
    }
  });

  await prepareDraft(page, 'en');
  const startDate = dateFromToday(-30);
  const endDate = dateFromToday(-1);
  await page.getByLabel('Start date').fill(startDate);
  await page.getByLabel('End date').fill(endDate);
  await page.getByRole('button', {name: 'Run analysis'}).click();

  await expect(page).toHaveURL(new RegExp(`/en/analysis/${SUCCEEDED_ID}$`));
  await expect(page.getByRole('heading', {name: 'NDVI statistics'})).toBeVisible();
  await expect(page.getByText('85%', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Sentinel-2 item A')).toBeVisible();
  // SUCCEEDED_ID's fixture preview_url is an unreachable placeholder host (private.invalid), so
  // the same-origin preview route (W6.1) honestly reports a fetch failure here — a real signed URL
  // decode-and-render path is covered by preview.spec.ts against PREVIEW_READY_ID.
  await expect(page.getByText('The NDVI preview image could not be fetched from the backend. No map layer is shown.')).toBeVisible({timeout: 15_000});

  const post = browserRequests.find((request) => request.method === 'POST' && request.pathname.endsWith('/api/analyses'));
  expect(post).toBeTruthy();
  expect(post?.authorization).toBeUndefined();
  expect(browserRequests.every((request) => request.authorization === undefined)).toBe(true);

  const storedKey = await page.evaluate(() => {
    const raw = sessionStorage.getItem('aqualedger.analysis-attempt.v1');
    return raw ? (JSON.parse(raw) as {key: string}).key : null;
  });
  const relayed = (await doubleRequests()).find((entry) => entry.idempotencyKey === storedKey);
  expect(relayed).toBeTruthy();

  const postCount = browserRequests.filter((request) => request.method === 'POST').length;
  await page.getByRole('link', {name: 'العربية'}).click();
  await expect(page).toHaveURL(new RegExp(`/ar/analysis/${SUCCEEDED_ID}$`));
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', {name: 'إحصاءات NDVI'})).toBeVisible();
  expect(browserRequests.filter((request) => request.method === 'POST')).toHaveLength(postCount);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/ar/analysis$`));
});

for (const locale of ['en', 'ar'] as const) {
  test(`IDEMPOTENCY_CONFLICT is shown in ${locale}`, async ({page}) => {
    await prepareDraft(page, locale);
    await page.getByLabel(locale === 'en' ? 'Start date' : 'تاريخ البداية').fill(CONFLICT_START_DATE);
    await page.getByLabel(locale === 'en' ? 'End date' : 'تاريخ النهاية').fill('2001-01-10');
    await page.getByRole('button', {name: locale === 'en' ? 'Run analysis' : 'شغّل التحليل'}).click();
    await expect(page.getByRole('alert').filter({hasText: locale === 'en'
      ? 'This request key was already used with different analysis input.'
      : 'استُخدم مفتاح هذا الطلب مسبقاً مع مدخلات تحليل مختلفة.'})).toBeVisible();
    await expect(page.locator('.result-id')).toHaveCount(0);
  });
}

test('failed status without evidence_status stays a failure and never requests a result', async ({page}) => {
  const resultRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === `/api/analyses/${FAILED_ID}/result`) resultRequests.push(request.url());
  });
  await page.goto(`/en/analysis/${FAILED_ID}`);
  await expect(page.getByText('No evidence status is shown for a failed run.')).toBeVisible();
  await expect(page.getByText('A required source tile or band could not be read.', {exact: true})).toHaveCount(1);
  await expect(page.getByText('Evidence status:', {exact: false})).toHaveCount(0);
  expect(resultRequests).toEqual([]);
});

test('a queued saved run is shown as pending and does not submit again', async ({page}) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/analyses')) posts.push(request.url());
  });
  await page.goto(`/ar/analysis/${QUEUED_ID}`);
  await expect(page.getByText('التحليل قيد التنفيذ')).toBeVisible();
  expect(posts).toEqual([]);
});

test.describe('source status (serialized: shares mutable /sources fixture state)', () => {
  test.describe.configure({mode: 'serial'});

  test('source status renders a fixture NOT_CHECKED response without a fabricated timestamp', async ({page}) => {
    await setSourcesMode('default');
    await page.goto('/en/settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', {level: 1, name: 'Settings / Data Sources'})).toBeVisible();
    await expect(page.getByText('Sentinel-2 L2A')).toBeVisible();
    await expect(page.getByText('Not checked', {exact: true}).first()).toBeVisible();
    await expect(page.getByText('Last checked', {exact: true}).locator('..')).toContainText('Not checked');
    await expect(page.locator('.source-item')).toHaveCount(1);
  });

  test('an empty source response remains distinct from an outage', async ({page}) => {
    await setSourcesMode('empty');
    await page.goto('/ar/settings');
    await expect(page.getByRole('status').filter({hasText: 'لم تُعد الواجهة الخلفية سجلات لمصادر مهيأة.'})).toBeVisible();
    await expect(page.locator('.source-item')).toHaveCount(0);
  });

  test('a source API outage is presented as unavailable and can be retried', async ({page}) => {
    await setSourcesMode('outage');
    await page.goto('/en/settings');
    await expect(page.getByRole('alert').filter({hasText: 'The backend could not be reached.'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Retry source status'})).toBeVisible();
    await setSourcesMode('default');
  });
});

test('map drawing works with zoom controls and reaches the AOI form', async ({page}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/en/analysis');
  const drawButton = page.getByRole('button', {name: 'Draw polygon'});
  await expect(drawButton).toBeEnabled({timeout: 45_000});

  const zoomIn = page.locator('.maplibregl-ctrl-zoom-in');
  for (let step = 0; step < 7; step += 1) await zoomIn.click();
  await drawButton.click();
  const map = page.getByTestId('map-canvas');
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('The map canvas has no visible bounds.');
  const left = bounds.x + bounds.width / 2 - 32;
  const top = bounds.y + bounds.height / 2 - 32;
  await page.mouse.click(left, top);
  await page.mouse.click(left + 64, top);
  await page.mouse.click(left + 64, top + 64);
  await page.mouse.dblclick(left, top + 64);
  await expect(page.getByText('One polygon is ready for validation.')).toBeVisible({timeout: 10_000});
  await expect(page.getByText('Area:', {exact: false})).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('small width keeps workspace controls in the viewport and keyboard focus visible', async ({page}) => {
  await page.goto('/ar/analysis');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const documentWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  await page.keyboard.press('Tab');
  await expect(page.locator('.brand-link')).toBeFocused();
  expect(await page.locator('.brand-link').evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await expect(page.getByRole('button', {name: 'ارسم مضلع'})).toBeVisible();
  await expect(page.getByLabel('تاريخ البداية')).toBeVisible();
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
