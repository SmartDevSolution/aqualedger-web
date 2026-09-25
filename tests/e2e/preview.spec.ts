import {expect, test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {
  ARTIFACT_NOT_READY_ID,
  FAILED_ID,
  NO_ARTIFACT_ID,
  PREVIEW_READY_ID,
  PREVIEW_URL_TOKEN,
  TEST_OPERATOR_TOKEN
} from '../fixtures/backend-double';

// DP-4 (Council issue #8, "M1 preview delivery to the browser, and basemap origin"). Covers:
// - W6.1's same-origin preview route contract (statuses, headers, honest error bodies), called
//   directly so each case is precise about one documented outcome;
// - W6.2's browser-visible outcome (the honest "rendered" state; pixel-level decode correctness is
//   covered separately, without a browser, by scripts/check-preview-decode.mjs);
// - W6.3's "no browser request leaves the app origin" property, over a full analysis journey.
// Not `import.meta.url`: Playwright loads spec files through its own CommonJS-targeting
// transform, where that syntax is a parse error (see tests/fixtures/backend-double.ts for the
// same constraint on a file this one transitively depends on).
const fixturePath = path.join(__dirname, '../fixtures/ndvi-preview-fixture.tif');

test.describe('same-origin preview route (DP-4 P1(a))', () => {
  test('streams the artifact bytes with the documented headers and never the operator token', async ({request}) => {
    const response = await request.get(`/api/analyses/${PREVIEW_READY_ID}/preview`, {
      headers: {Authorization: 'Bearer browser-injected-should-never-reach-the-backend'}
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/tiff');
    expect(response.headers()['cache-control']).toBe('private, no-store');

    const body = await response.body();
    const fixtureBytes = await readFile(fixturePath);
    expect(Buffer.compare(body, fixtureBytes)).toBe(0);
    expect(body.toString('latin1')).not.toContain(TEST_OPERATOR_TOKEN);
  });

  test('reports PREVIEW_NOT_READY at 200 for an uncommitted analysis, mirroring the backend envelope', async ({request}) => {
    const id = randomUUID();
    const response = await request.get(`/api/analyses/${id}/preview`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_NOT_READY');
  });

  test('reports PREVIEW_RESULT_UNAVAILABLE when the analysis itself failed', async ({request}) => {
    const response = await request.get(`/api/analyses/${FAILED_ID}/preview`);
    expect(response.status()).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_RESULT_UNAVAILABLE');
  });

  test('reports PREVIEW_ARTIFACT_MISSING when the committed result has no ndvi_preview artifact', async ({request}) => {
    const response = await request.get(`/api/analyses/${NO_ARTIFACT_ID}/preview`);
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_ARTIFACT_MISSING');
  });

  test('reports PREVIEW_ARTIFACT_NOT_READY when the artifact exists but is not ready', async ({request}) => {
    const response = await request.get(`/api/analyses/${ARTIFACT_NOT_READY_ID}/preview`);
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_ARTIFACT_NOT_READY');
  });

  test('never logs or echoes the signed preview_url query token in an error body', async ({request}) => {
    const response = await request.get(`/api/analyses/${FAILED_ID}/preview`);
    expect(await response.text()).not.toContain(PREVIEW_URL_TOKEN);
  });
});

test.describe('browser-visible preview outcomes and basemap origin (DP-4 P1(c)/P2/P4)', () => {
  test('a ready, georeferenced artifact renders honestly on the workspace map', async ({page}) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto(`/en/analysis/${PREVIEW_READY_ID}`);
    await expect(page.getByText(/rendered on the map above as an estimate/)).toBeVisible({timeout: 15_000});

    const previewRequests = requests.filter((url) => new URL(url).pathname === `/api/analyses/${PREVIEW_READY_ID}/preview`);
    expect(previewRequests.length).toBeGreaterThan(0);

    const baseOrigin = new URL(page.url()).origin;
    const offOrigin = requests.filter((url) => new URL(url).origin !== baseOrigin);
    expect(offOrigin).toEqual([]);
  });

  test('no browser request leaves the app origin across a full analysis journey, including the preview attempt', async ({page}) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto('/en/analysis');
    await page.locator('.coordinate-entry summary').click();
    await page.getByLabel('Polygon GeoJSON').fill(JSON.stringify({
      type: 'Polygon',
      coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]
    }));
    await page.getByRole('button', {name: 'Use polygon'}).click();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - 10);
    await page.getByLabel('Start date').fill(startDate.toISOString().slice(0, 10));
    await page.getByLabel('End date').fill(today.toISOString().slice(0, 10));
    await page.getByRole('button', {name: 'Run analysis'}).click();

    await expect(page.getByRole('heading', {name: 'NDVI statistics'})).toBeVisible();
    // Give the (server-side-only) preview fetch attempt time to resolve so any hypothetical
    // browser-side fetch of the signed storage URL would already have been observed.
    await expect(page.getByText('No map layer is shown.', {exact: false})).toBeVisible({timeout: 15_000});

    const baseOrigin = new URL(page.url()).origin;
    const offOrigin = requests.filter((url) => new URL(url).origin !== baseOrigin);
    expect(offOrigin).toEqual([]);
  });
});

test.describe('self-hosted basemap and localized map controls (DP-4 P2, W6.4)', () => {
  test('the basemap style loads same-origin and no browser request leaves the app origin while the map loads', async ({page}) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto('/en/analysis');
    await expect(page.getByRole('button', {name: 'Draw polygon'})).toBeEnabled({timeout: 45_000});

    const baseOrigin = new URL(page.url()).origin;
    expect(requests.some((url) => new URL(url).pathname === '/basemap/style.json')).toBe(true);
    expect(requests.filter((url) => new URL(url).origin !== baseOrigin)).toEqual([]);
  });

  for (const locale of ['en', 'ar'] as const) {
    test(`map control tooltips and the cooperative-gesture hint are localized in ${locale}`, async ({page}) => {
      await page.goto(`/${locale}/analysis`);
      await expect(page.getByRole('button', {name: locale === 'en' ? 'Draw polygon' : 'ارسم مضلعاً'})).toBeEnabled({timeout: 45_000});

      const expectedZoomIn = locale === 'en' ? 'Zoom in' : 'تكبير';
      const expectedZoomOut = locale === 'en' ? 'Zoom out' : 'تصغير';
      await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveAttribute('title', expectedZoomIn);
      await expect(page.locator('.maplibregl-ctrl-zoom-out')).toHaveAttribute('title', expectedZoomOut);

      // Not necessarily visible (MapLibre only flashes this on a blocked cooperative-gesture
      // scroll), but its text is present in the DOM as soon as the map initializes.
      const expectedGestureHint = locale === 'en' ? 'Use Ctrl + scroll to zoom the map' : 'استخدم Ctrl + التمرير لتكبير الخريطة';
      await expect(page.locator('.maplibregl-desktop-message')).toHaveText(expectedGestureHint);
    });
  }
});
