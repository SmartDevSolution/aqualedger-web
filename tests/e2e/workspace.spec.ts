import {expect, test, type Page} from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:3100/test-api';
const analysisId = '5b4d86a2-8b3e-4e11-9045-bce502aa1a31';
const polygon = {
  type: 'Polygon',
  coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]
};
const polygonText = JSON.stringify(polygon);

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
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyses')) posts.push(request.url());
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
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyses')) posts.push(request.url());
  });
  await timezonePage.goto('/ar/analysis');
  await expect(timezonePage.getByLabel('تاريخ البداية')).toHaveValue(startDate);
  await expect(timezonePage.getByLabel('تاريخ النهاية')).toHaveValue(endDate);
  expect(await timezonePage.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Pacific/Honolulu');
  expect(posts).toEqual([]);
  await timezoneContext.close();
});

test('explicit submission sends a keyed request, loads saved status and result, and survives locale switching', async ({page}) => {
  const requests: {method: string; pathname: string; headers: Record<string, string>; body: unknown}[] = [];
  let submittedRequest: {aoi_geojson: typeof polygon; start_date: string; end_date: string; locale?: string} | null = null;
  await page.route(`${apiOrigin}/analyses`, async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as {aoi_geojson: typeof polygon; start_date: string; end_date: string; locale?: string};
    submittedRequest = body;
    requests.push({method: request.method(), pathname: new URL(request.url()).pathname, headers: request.headers(), body});
    await route.fulfill({status: 202, contentType: 'application/json', body: JSON.stringify({analysis_id: analysisId, status_url: `/analyses/${analysisId}`})});
  });
  await page.route(`${apiOrigin}/analyses/${analysisId}`, async (route) => {
    requests.push({method: 'GET', pathname: new URL(route.request().url()).pathname, headers: route.request().headers(), body: null});
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(statusResponse(analysisId, 'SUCCEEDED', 'NOT_ASSESSED'))});
  });
  await page.route(`${apiOrigin}/analyses/${analysisId}/result`, async (route) => {
    requests.push({method: 'GET', pathname: new URL(route.request().url()).pathname, headers: route.request().headers(), body: null});
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(resultResponse(analysisId, submittedRequest))});
  });

  await prepareDraft(page, 'en');
  const startDate = dateFromToday(-30);
  const endDate = dateFromToday(-1);
  await page.getByLabel('Start date').fill(startDate);
  await page.getByLabel('End date').fill(endDate);
  await page.getByRole('button', {name: 'Run analysis'}).click();

  await expect(page).toHaveURL(new RegExp(`/en/analysis/${analysisId}$`));
  await expect(page.getByRole('heading', {name: 'NDVI statistics'})).toBeVisible();
  await expect(page.getByText('85%', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Sentinel-2 item A')).toBeVisible();
  await expect(page.getByText(/backend returned an NDVI GeoTIFF artifact/)).toBeVisible();

  const post = requests.find((request) => request.method === 'POST');
  expect(post?.pathname.endsWith('/analyses')).toBe(true);
  expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  expect(post?.headers.authorization).toBeUndefined();
  expect(post?.body).toMatchObject({aoi_geojson: polygon, start_date: startDate, end_date: endDate, locale: 'en'});
  expect(post?.body).not.toHaveProperty('timezone');

  const postCount = requests.filter((request) => request.method === 'POST').length;
  await page.getByRole('link', {name: 'العربية'}).click();
  await expect(page).toHaveURL(new RegExp(`/ar/analysis/${analysisId}$`));
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', {name: 'إحصاءات NDVI'})).toBeVisible();
  expect(requests.filter((request) => request.method === 'POST')).toHaveLength(postCount);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/ar/analysis$`));
});

for (const locale of ['en', 'ar'] as const) {
  test(`IDEMPOTENCY_CONFLICT is shown in ${locale}`, async ({page}) => {
    let submittedKey: string | undefined;
    await page.route(`${apiOrigin}/analyses`, async (route) => {
      submittedKey = route.request().headers()['idempotency-key'];
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({error: {code: 'IDEMPOTENCY_CONFLICT', params: {idempotency_key: submittedKey}, request_id: 'req-conflict-1'}})
      });
    });
    await prepareDraft(page, locale);
    await page.getByLabel(locale === 'en' ? 'Start date' : 'تاريخ البداية').fill(dateFromToday(-10));
    await page.getByLabel(locale === 'en' ? 'End date' : 'تاريخ النهاية').fill(dateFromToday(-1));
    await page.getByRole('button', {name: locale === 'en' ? 'Run analysis' : 'شغّل التحليل'}).click();
    await expect(page.getByRole('alert').filter({hasText: locale === 'en'
      ? 'This request key was already used with different analysis input.'
      : 'استُخدم مفتاح هذا الطلب مسبقاً مع مدخلات تحليل مختلفة.'})).toBeVisible();
    expect(submittedKey).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(page.locator('.result-id')).toHaveCount(0);
  });
}

test('failed status without evidence_status stays a failure and never requests a result', async ({page}) => {
  let resultRequests = 0;
  await page.route(`${apiOrigin}/analyses/${analysisId}`, async (route) => {
    const status = statusResponse(analysisId, 'FAILED');
    delete status.evidence_status;
    status.errors = [{code: 'SOURCE_READ_FAILED', params: {band: 'nir'}}];
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(status)});
  });
  await page.route(`${apiOrigin}/analyses/${analysisId}/result`, async (route) => {
    resultRequests += 1;
    await route.fulfill({status: 500, body: ''});
  });
  await page.goto(`/en/analysis/${analysisId}`);
  await expect(page.getByText('No evidence status is shown for a failed run.')).toBeVisible();
  await expect(page.getByText('A required source tile or band could not be read.', {exact: true})).toHaveCount(1);
  await expect(page.getByText('Evidence status:', {exact: false})).toHaveCount(0);
  expect(resultRequests).toBe(0);
});

test('a queued saved run is shown as pending and does not submit again', async ({page}) => {
  let postRequests = 0;
  await page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyses')) postRequests += 1;
  });
  await page.route(`${apiOrigin}/analyses/${analysisId}`, async (route) => {
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(statusResponse(analysisId, 'QUEUED', 'NOT_ASSESSED'))});
  });
  await page.goto(`/ar/analysis/${analysisId}`);
  await expect(page.getByText('التحليل قيد التنفيذ')).toBeVisible();
  expect(postRequests).toBe(0);
});

test('source status renders a fixture NOT_CHECKED response without a fabricated timestamp', async ({page}) => {
  await page.route(`${apiOrigin}/sources`, async (route) => {
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({sources: [sourceResponse()]})});
  });
  await page.goto('/en/settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', {level: 1, name: 'Settings / Data Sources'})).toBeVisible();
  await expect(page.getByText('Sentinel-2 L2A')).toBeVisible();
  await expect(page.getByText('Not checked', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Last checked', {exact: true}).locator('..')).toContainText('Not checked');
  await expect(page.locator('.source-item')).toHaveCount(1);
});

test('an empty source response remains distinct from an outage', async ({page}) => {
  await page.route(`${apiOrigin}/sources`, async (route) => {
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({sources: []})});
  });
  await page.goto('/ar/settings');
  await expect(page.getByRole('status').filter({hasText: 'لم تُعد الواجهة الخلفية سجلات لمصادر مهيأة.'})).toBeVisible();
  await expect(page.locator('.source-item')).toHaveCount(0);
});

test('a source API outage is presented as unavailable and can be retried', async ({page}) => {
  await page.route(`${apiOrigin}/sources`, async (route) => route.abort('failed'));
  await page.goto('/en/settings');
  await expect(page.getByRole('alert').filter({hasText: 'The backend could not be reached.'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Retry source status'})).toBeVisible();
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

type StatusFixture = {
  analysis_id: string;
  execution_status: string;
  evidence_status?: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
  warnings: unknown[];
  errors: {code: string; params: Record<string, unknown>}[];
};

function statusResponse(id: string, executionStatus: string, evidenceStatus?: string): StatusFixture {
  return {
    analysis_id: id,
    execution_status: executionStatus,
    ...(evidenceStatus ? {evidence_status: evidenceStatus} : {}),
    start_date: '2026-08-01',
    end_date: '2026-08-30',
    created_at: '2026-09-24T12:00:00Z',
    updated_at: '2026-09-24T12:01:00Z',
    warnings: [],
    errors: []
  };
}

function resultResponse(
  id: string,
  request: {aoi_geojson: typeof polygon; start_date: string; end_date: string; locale?: string} | null
) {
  const selectedDate = request?.end_date ?? '2026-08-30';
  return {
    analysis_id: id,
    schema_version: '1',
    pipeline_version: 'm1-pipeline-test',
    method_version: 'ndvi-test',
    execution_status: 'SUCCEEDED',
    evidence_status: 'NOT_ASSESSED',
    request: request ?? {aoi_geojson: polygon, start_date: '2026-08-01', end_date: '2026-08-30', locale: 'en'},
    effective_coverage: {acquisition_date: selectedDate, valid_coverage_fraction: 0.85, min_valid_coverage_fraction_guard: 0.5},
    statistics: {
      valid_observation_count: 1200,
      valid_area_m2: 120000,
      ndvi_min: -0.15,
      ndvi_max: 0.79,
      ndvi_mean: 0.42,
      ndvi_median: 0.44,
      ndvi_p05: 0.08,
      ndvi_p95: 0.71,
      masked_fraction: 0.12,
      rejection_counts: {masked_class: 20, missing_data: 4, non_positive_denominator: 0, out_of_range: 0}
    },
    scenes_evaluated: [{acquisition_date: selectedDate, valid_coverage_fraction: 0.85, selected: true, item_ids: ['Sentinel-2 item A'], rejection_reason: null}],
    provenance: {
      source_id: 'sentinel2_l2a_earth_search',
      provider: 'Earth Search',
      collection: 'sentinel-2-l2a',
      item_ids: ['Sentinel-2 item A'],
      asset_hrefs: {},
      acquisition_datetime: `${selectedDate}T08:20:00Z`,
      processing_baseline: '05.11',
      scale: 0.0001,
      offset: 0,
      mask_policy: 'SCL M1 policy',
      mask_masked_classes: [0, 1, 3, 8, 9, 10, 11],
      mask_retained_classes: [2, 4, 5, 6, 7],
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      grid_origin: [100, 200],
      resampling_scl: 'nearest',
      aoi_hash: 'fixture-only',
      stac_query: {}
    },
    artifacts: [{kind: 'ndvi_preview', storage_key: 'private/fixture-only', size_bytes: 1200, preview_url: 'https://private.invalid/signed'}],
    limitations: []
  };
}

function sourceResponse() {
  return {
    source_id: 'sentinel2_l2a_earth_search',
    name: 'Sentinel-2 L2A',
    provider: 'Earth Search',
    collection: 'sentinel-2-l2a',
    temporal_or_static: 'TEMPORAL',
    mandatory: true,
    configured: true,
    enabled: true,
    check: {status: 'NOT_CHECKED', checked_at: null, check_scope: null, reason_code: null, reason_params: {}}
  };
}

function dateFromToday(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
