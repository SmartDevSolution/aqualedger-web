import {expect, test} from '@playwright/test';

const polygonText = JSON.stringify({
  type: 'Polygon',
  coordinates: [[
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
    [0, 0.01],
    [0, 0]
  ]]
});

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
  await page.getByText('Enter polygon GeoJSON').click();
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

test('draft locale switching preserves AOI and ISO dates without sending a request', async ({page}) => {
  const analysisPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyses')) {
      analysisPosts.push(request.url());
    }
  });

  await page.goto('/en/analysis');
  await page.getByText('Enter polygon GeoJSON').click();
  await page.getByLabel('Polygon GeoJSON').fill(polygonText);
  await page.getByRole('button', {name: 'Use polygon'}).click();
  const startDate = dateFromToday(-30);
  const endDate = dateFromToday(-1);
  await page.getByLabel('Start date').fill(startDate);
  await page.getByLabel('End date').fill(endDate);
  await expect(page.getByRole('button', {name: 'Run analysis'})).toBeEnabled();
  await page.getByRole('button', {name: 'Run analysis'}).click();
  await expect(page.getByRole('status').filter({hasText: 'No analysis was submitted.'})).toBeVisible();
  await expect(page.getByText('Not submitted', {exact: true})).toBeVisible();

  await page.getByRole('link', {name: 'العربية'}).click();
  await expect(page).toHaveURL(/\/ar\/analysis$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel('تاريخ البداية')).toHaveValue(startDate);
  await expect(page.getByLabel('تاريخ النهاية')).toHaveValue(endDate);
  await expect(page.getByText('المساحة')).toBeVisible();
  await expect(page.getByRole('button', {name: 'شغّل التحليل'})).toBeEnabled();
  expect(analysisPosts).toEqual([]);
});

test('settings clearly reports that source checks are unavailable and does not invent source rows', async ({page}) => {
  await page.goto('/en/settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', {level: 1, name: 'Settings / Data Sources'})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText: 'No source checks were requested.'})).toBeVisible();
  await expect(page.getByText('NOT_CHECKED', {exact: true})).toHaveCount(0);
  await expect(page.locator('.source-item')).toHaveCount(0);
});

test('refresh and language switch keep a saved analysis URL without claiming a loaded result', async ({page}) => {
  const analysisPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/analyses')) {
      analysisPosts.push(request.url());
    }
  });

  await page.goto('/en/analysis/run-id-123');
  await expect(page.getByText('Analysis ID in this URL')).toBeVisible();
  await expect(page.locator('.result-id')).toHaveText('run-id-123');
  await expect(page.getByText('A result cannot be loaded until the backend contract is pinned.')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/en\/analysis\/run-id-123$/);
  await expect(page.locator('.result-id')).toHaveText('run-id-123');
  await page.getByRole('link', {name: 'العربية'}).click();
  await expect(page).toHaveURL(/\/ar\/analysis\/run-id-123$/);
  await expect(page.locator('.result-id')).toHaveText('run-id-123');
  await expect(page.getByText('لا يمكن تحميل نتيجة حتى يتم تثبيت عقد الواجهة الخلفية.')).toBeVisible();
  expect(analysisPosts).toEqual([]);
});

test('map polygon drawing works with zoom controls and reaches the AOI form', async ({page}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/en/analysis');
  const drawButton = page.getByRole('button', {name: 'Draw polygon'});
  await expect(drawButton).toBeEnabled({timeout: 45_000});

  const zoomIn = page.locator('.maplibregl-ctrl-zoom-in');
  for (let step = 0; step < 7; step += 1) {
    await zoomIn.click();
  }

  await drawButton.click();
  const map = page.getByTestId('map-canvas');
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) {
    throw new Error('The map canvas has no visible bounds.');
  }
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

test('small width keeps workspace controls inside the viewport and keyboard focus visible', async ({page}) => {
  await page.goto('/ar/analysis');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', {level: 1, name: 'مساحة التحليل'})).toBeVisible();
  const documentWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
  const viewportWidth = page.viewportSize()?.width;
  expect(viewportWidth).toBeDefined();
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth ?? 0);

  await page.keyboard.press('Tab');
  await expect(page.locator('.brand-link')).toBeFocused();
  const focusStyle = await page.locator('.brand-link').evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(focusStyle).not.toBe('none');
  await expect(page.getByRole('button', {name: 'ارسم مضلع'})).toBeVisible();
  await expect(page.getByLabel('تاريخ البداية')).toBeVisible();
});

function dateFromToday(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
