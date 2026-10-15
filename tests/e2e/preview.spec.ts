import {expect, test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {
  ARTIFACT_NOT_READY_ID,
  ARTIFACT_URL_UNAVAILABLE_ID,
  FAILED_ID,
  NO_ARTIFACT_ID,
  PREVIEW_ARTIFACT_BOUNDS,
  PREVIEW_ARTIFACT_CRS,
  PREVIEW_READY_ID,
  PREVIEW_URL_TOKEN,
  RESULT_NOT_FOUND_ID,
  TEST_OPERATOR_TOKEN
} from '../fixtures/backend-double';
import {boundsToImageCoordinates, decodePreviewImage} from '../../src/lib/preview/geotiff-overlay';

const PREVIEW_SOURCE_ID = 'ndvi-preview-source';
const PREVIEW_LAYER_ID = 'ndvi-preview-layer';

// Owner directive 2026-10-11 replaced the M1 self-hosted minimal basemap (Council DP-4 P2) with a
// real geographical one served by an external MapLibre-compatible provider, so "no request leaves
// the app origin" can no longer hold literally. It is kept as an explicit *allowlist* of the
// declared basemap tile hosts instead of being dropped: the property that actually mattered — the
// browser never talks to an undeclared third party and never fetches a signed storage URL itself —
// is still enforced, and a new provider cannot be introduced silently.
const DECLARED_BASEMAP_HOSTS = ['server.arcgisonline.com'];
const undeclaredOffOrigin = (requests: string[], baseOrigin: string) =>
  requests.filter(
    (url) => new URL(url).origin !== baseOrigin && !DECLARED_BASEMAP_HOSTS.includes(new URL(url).host)
  );

type PreviewProbeResult = {
  hasLayer: boolean;
  hasSource: boolean;
  sourceCoordinates: unknown;
  insidePixel: number[];
  outsidePixel: number[];
};

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

  test('reports PREVIEW_NOT_READY with execution_status FAILED for a failed analysis run, mirroring the backend envelope', async ({request}) => {
    // The real backend answers a FAILED run the same frozen 200 NOT_READY envelope as any other
    // uncommitted run (analyses.py `get_analysis_result`), not a distinct non-200 failure.
    const response = await request.get(`/api/analyses/${FAILED_ID}/preview`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_NOT_READY');
    expect(body.error.params.execution_status).toBe('FAILED');
  });

  test('reports PREVIEW_RESULT_UNAVAILABLE for a genuine non-200 result-fetch failure', async ({request}) => {
    // Mirrors the real backend's actual 404 NOT_FOUND, establishing this branch with a response
    // that can really occur, rather than a fabricated one.
    const response = await request.get(`/api/analyses/${RESULT_NOT_FOUND_ID}/preview`);
    expect(response.status()).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_RESULT_UNAVAILABLE');
  });

  test('reports PREVIEW_URL_UNAVAILABLE when a ready artifact carries no preview_url', async ({request}) => {
    const response = await request.get(`/api/analyses/${ARTIFACT_URL_UNAVAILABLE_ID}/preview`);
    expect(response.status()).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_URL_UNAVAILABLE');
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
  test('a ready, georeferenced artifact renders an actual overlay: layer, placement and pixels', async ({page}) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto(`/en/analysis/${PREVIEW_READY_ID}`);
    await expect(page.getByText(/rendered on the map as an estimate/)).toBeVisible({timeout: 15_000});

    const previewRequests = requests.filter((url) => new URL(url).pathname === `/api/analyses/${PREVIEW_READY_ID}/preview`);
    expect(previewRequests.length).toBeGreaterThan(0);

    const baseOrigin = new URL(page.url()).origin;
    expect(undeclaredOffOrigin(requests, baseOrigin)).toEqual([]);

    // W7.4: the "ready" text and preview request above are necessary but not sufficient — they
    // still pass when no raster layer is ever added to the map (a suppressed `map.addLayer` was
    // verified to leave this exact prior assertion set green). What follows asserts what the
    // browser actually renders: the layer/source exist, the source's placement matches the
    // artifact's own recorded bounds, and the rendered pixels match the decoded fixture's own RGB.
    const expectedCoordinates = boundsToImageCoordinates(PREVIEW_ARTIFACT_BOUNDS, PREVIEW_ARTIFACT_CRS);
    if (!expectedCoordinates) {
      throw new Error('the fixture artifact bounds/CRS must be placeable');
    }
    const lons = expectedCoordinates.map(([lon]) => lon);
    const lats = expectedCoordinates.map(([, lat]) => lat);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    // 25% across / 25% down from the artifact's own north-west corner: close enough to the
    // fixture's top-left texel center (opaque red, see tests/fixtures/ndvi-preview-fixture.tif and
    // scripts/check-preview-decode.mjs) that MapLibre's texture sampling returns that texel's own
    // color rather than a blend with its neighbours.
    const insideLon = minLon + 0.25 * (maxLon - minLon);
    const insideLat = maxLat - 0.25 * (maxLat - minLat);
    // Half a bounding-box width further west, same latitude: geographically outside the artifact's
    // own rectangular placement, but still on-screen after the padded fitBounds below.
    const outsideLon = minLon - 0.5 * (maxLon - minLon);
    const outsideLat = insideLat;

    const probeArgs = {
      sw: [minLon, minLat] as [number, number],
      ne: [maxLon, maxLat] as [number, number],
      insideLon,
      insideLat,
      outsideLon,
      outsideLat,
      sourceId: PREVIEW_SOURCE_ID,
      layerId: PREVIEW_LAYER_ID
    };

    const probeOnce = () =>
      page.evaluate<PreviewProbeResult, typeof probeArgs>(({sw, ne, insideLon, insideLat, outsideLon, outsideLat, sourceId, layerId}) => {
        const map = (window as unknown as {__AQUALEDGER_TEST_MAP__?: import('maplibre-gl').Map}).__AQUALEDGER_TEST_MAP__;
        if (!map) {
          throw new Error('the test-only map hook (__AQUALEDGER_TEST_MAP__) is not present');
        }
        // Move the camera onto the artifact's own bounds so the pixel probe below is guaranteed
        // on-screen, independent of the app's own default camera framing (not itself under test).
        map.fitBounds([sw, ne], {animate: false, padding: 80});
        map.triggerRepaint();
        return new Promise<PreviewProbeResult>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
            const layer = map.getLayer(layerId);
            const source = map.getSource(sourceId) as unknown as {coordinates?: unknown} | undefined;
            const canvas = map.getCanvas();
            const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext;
            // `map.project` returns CSS pixels; `readPixels` operates on the framebuffer's own
            // resolution, which differs from CSS size whenever devicePixelRatio !== 1. Scale
            // explicitly instead of assuming the two coincide.
            const scaleX = canvas.width / canvas.clientWidth;
            const scaleY = canvas.height / canvas.clientHeight;
            const readPixel = (lon: number, lat: number): number[] => {
              const point = map.project([lon, lat]);
              const x = Math.round(point.x * scaleX);
              const y = canvas.height - Math.round(point.y * scaleY) - 1;
              const buffer = new Uint8Array(4);
              gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
              return Array.from(buffer);
            };
            resolve({
              hasLayer: Boolean(layer),
              hasSource: Boolean(source),
              sourceCoordinates: source?.coordinates ?? null,
              insidePixel: readPixel(insideLon, insideLat),
              outsidePixel: readPixel(outsideLon, outsideLat)
            });
          })));
        });
      }, probeArgs);

    const fixtureBytes = await readFile(fixturePath);
    const fixtureArrayBuffer = fixtureBytes.buffer.slice(fixtureBytes.byteOffset, fixtureBytes.byteOffset + fixtureBytes.byteLength);
    const decoded = await decodePreviewImage(fixtureArrayBuffer);
    const expectedInsideColor = Array.from(decoded.rgba.slice(0, 4)); // the fixture's top-left texel: opaque red
    const tolerance = 40;
    const closeEnough = (a: number[], b: number[]) => a.every((value, channel) => Math.abs(value - b[channel]!) <= tolerance);

    // The GPU texture upload can lag a frame or two behind `addLayer`/`addSource` returning — poll
    // the actual rendered pixel instead of asserting on a single snapshot that could land
    // mid-upload.
    let probe: PreviewProbeResult = await probeOnce();
    await expect
      .poll(async () => {
        probe = await probeOnce();
        return probe.hasLayer && probe.hasSource && closeEnough(probe.insidePixel, expectedInsideColor);
      }, {timeout: 5_000, message: 'the preview overlay never rendered its own artifact pixels on the map'})
      .toBe(true);

    expect(probe.hasLayer).toBe(true);
    expect(probe.hasSource).toBe(true);
    expect(probe.sourceCoordinates).toEqual(expectedCoordinates);

    for (let channel = 0; channel < 4; channel += 1) {
      expect(
        Math.abs(probe.insidePixel[channel]! - expectedInsideColor[channel]!),
        `inside pixel channel ${channel}: got ${probe.insidePixel}, expected close to ${expectedInsideColor}`
      ).toBeLessThanOrEqual(tolerance);
    }

    expect(
      closeEnough(probe.outsidePixel, expectedInsideColor),
      `pixel outside the artifact's bounds must not carry its color: got ${probe.outsidePixel}`
    ).toBe(false);
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
    expect(undeclaredOffOrigin(requests, baseOrigin)).toEqual([]);
  });

  test('a committed but not-yet-ready ndvi_preview artifact reads distinctly from a genuinely missing one (W8)', async ({page}) => {
    // Both ids reach `runState.kind === 'complete'` (ARTIFACT_NOT_READY_ID and NO_ARTIFACT_ID are
    // in the double's `immediateResultIds`), so this exercises workspace.tsx's own artifact-record
    // branch, not the preview route (which the "no artifact" collapse bypassed entirely).
    const notReadyText = 'The backend has not finished preparing the NDVI preview artifact yet. No map layer is shown.';
    const missingText = 'The backend result contains no ready NDVI preview artifact. No map layer is shown.';
    expect(notReadyText).not.toBe(missingText);

    await page.goto(`/en/analysis/${ARTIFACT_NOT_READY_ID}`);
    await expect(page.getByText(notReadyText)).toBeVisible({timeout: 15_000});
    await expect(page.getByText(missingText)).toHaveCount(0);

    await page.goto(`/en/analysis/${NO_ARTIFACT_ID}`);
    await expect(page.getByText(missingText)).toBeVisible({timeout: 15_000});
    await expect(page.getByText(notReadyText)).toHaveCount(0);
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
    // Non-vacuity: the basemap must actually be fetched from the declared provider, otherwise an
    // allowlist would pass just as happily over a map that loads no tiles at all.
    const basemapTiles = requests.filter((url) => new URL(url).host === 'server.arcgisonline.com');
    expect(basemapTiles.length).toBeGreaterThan(0);
    expect(basemapTiles.every((url) => /\/MapServer\/tile\//.test(url))).toBe(true);
    expect(undeclaredOffOrigin(requests, baseOrigin)).toEqual([]);
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
