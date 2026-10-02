import {expect, test, type Page} from '@playwright/test';
import {
  CONFLICT_START_DATE,
  FAILED_ID,
  FAILED_WRONG_PATH_CODE_ID,
  NO_ELIGIBLE_ACQUISITION_ID,
  NO_ELIGIBLE_ACQUISITION_UNDEFINED_COVERAGE_ID,
  NO_SCENES_FOUND_ID,
  NO_VALID_PIXEL_ID,
  QUEUED_ID,
  SUCCEEDED_ID
} from '../fixtures/backend-double';

const doubleBase = 'http://127.0.0.1:3199';
const polygon = {
  type: 'Polygon',
  coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]
};
const polygonText = JSON.stringify(polygon);

async function setSourcesMode(mode: 'default' | 'empty' | 'outage' | 'unknownRole') {
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

// W14: the run-level `errors[].code` and per-date `rejection_reason` vocabularies must not accept
// each other's codes. `LOW_VALID_COVERAGE` is a real per-date-only rejection reason
// (pipeline.py:246-261); the run-level `failure_reason_code` path can never actually publish it
// (only `SOURCE_READ_FAILED`, `SOURCE_UNAVAILABLE`, `PROCESSING_FAILED` — worker/runner.py's
// `_fail` call sites), so this must render the honest unknown-reason fallback, never the per-date
// `LOW_VALID_COVERAGE` translation.
test('a run-level failure code that is only ever a per-date reason renders the honest unknown fallback', async ({page}) => {
  await page.goto(`/en/analysis/${FAILED_WRONG_PATH_CODE_ID}`);
  await expect(page.getByText('The backend reported a failure reason that this web version does not recognize.', {exact: true})).toHaveCount(1);
  await expect(page.getByText('The acquisition did not meet the configured valid-coverage guard.')).toHaveCount(0);
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
    // A41: the pinned backend publishes `temporal_or_static: "temporal"` (lowercase) for this
    // mandatory Sentinel-2 source; the mandatory temporal source must read "Temporal", never the
    // false "Static" a case-sensitive `=== 'TEMPORAL'` comparison used to render.
    await expect(page.getByText('Data role', {exact: true}).locator('..')).toContainText('Temporal');
  });

  test('an unrecognized temporal_or_static value renders an honest unknown role, never a false Static (A41)', async ({page}) => {
    await setSourcesMode('unknownRole');
    await page.goto('/en/settings');
    await expect(page.getByText('Sentinel-2 L2A')).toBeVisible();
    const roleFact = page.getByText('Data role', {exact: true}).locator('..');
    await expect(roleFact).toContainText('Unrecognized data role');
    await expect(roleFact).not.toContainText('Static');
    await expect(roleFact).not.toContainText('Temporal');
    await setSourcesMode('default');
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

// Widths 641-1364 were measured against a local production build (`npm run start`) with this
// harness's own tabUntilFocused keyboard path: the sticky header's rendered height briefly exceeds
// the 84px `--header-height` reserved by `scroll-padding-top` at 641px (two-line header content,
// ~86.6px), yet the focused start/end date fields still land far below the header's actual bottom
// edge at every width below, so all clear and are covered here (W11 gap #5).
const stickyHeaderWidths = [641, 768, 900, 1024, 1364, 1365] as const;

for (const locale of ['en', 'ar'] as const) {
  for (const width of stickyHeaderWidths) {
    test(`desktop keyboard focus into the date fields is never obscured by the sticky header at ${width}px in ${locale}`, async ({page}) => {
      // Forced regardless of project viewport (this file also runs under small-width-chromium).
      await page.setViewportSize({width, height: 900});
      await page.goto(`/${locale}/analysis`);

      // Reaches the GeoJSON drawer, textarea and "Use polygon" button purely by real Tab/Enter/type
      // key presses from page load, instead of Playwright's click()/fill() (which auto-scroll the
      // target into view and mask the defect): the browser's own native scroll-into-view-on-focus,
      // triggered when a later Tab needs to bring an off-screen field into view, is what lands a
      // field under the sticky header — that only happens on this unassisted keyboard path.
      const summary = page.locator('.coordinate-entry summary');
      await tabUntilFocused(page, summary);
      await page.keyboard.press('Enter');
      const textarea = page.getByLabel(locale === 'en' ? 'Polygon GeoJSON' : 'GeoJSON للمضلع');
      await expect(textarea).toBeVisible();
      await tabUntilFocused(page, textarea);
      await page.keyboard.type(polygonText);
      const usePolygonButton = page.getByRole('button', {name: locale === 'en' ? 'Use polygon' : 'استخدم المضلع'});
      await tabUntilFocused(page, usePolygonButton);
      await page.keyboard.press('Enter');

      const headerBottom = await page.locator('.site-header').evaluate((element) => element.getBoundingClientRect().bottom);

      const startDate = page.getByLabel(locale === 'en' ? 'Start date' : 'تاريخ البداية');
      await tabUntilFocused(page, startDate);
      // The browser's scroll-into-view-on-focus animates (unless scroll-behavior is not smooth); a
      // measurement taken immediately can still show the correct in-progress position even when the
      // animation later overshoots and settles the field back under the header, so this waits out
      // the animation before asserting the position that actually persists.
      await page.waitForTimeout(1000);
      const startBox = await startDate.boundingBox();
      expect(startBox).not.toBeNull();
      expect(startBox!.y).toBeGreaterThanOrEqual(headerBottom);

      // The native date input exposes several internal segments (month/day/year) that Tab moves
      // through before leaving the control, so reaching end-date takes more than one further Tab.
      const endDate = page.getByLabel(locale === 'en' ? 'End date' : 'تاريخ النهاية');
      await tabUntilFocused(page, endDate);
      await page.waitForTimeout(1000);
      const endBox = await endDate.boundingBox();
      expect(endBox).not.toBeNull();
      expect(endBox!.y).toBeGreaterThanOrEqual(headerBottom);
    });
  }
}

async function tabUntilFocused(page: Page, locator: ReturnType<Page['locator']>, max = 20) {
  for (let attempt = 0; attempt < max; attempt += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('tabUntilFocused: target never received focus within the Tab budget.');
}

for (const locale of ['en', 'ar'] as const) {
  test(`provenance shows the real scale/offset value and evaluated-scene/limitation rows are shown honestly in ${locale}`, async ({page}) => {
    await page.goto(`/${locale}/analysis/${SUCCEEDED_ID}`);

    const scaleOffset = page.locator('.result-fact', {hasText: locale === 'en' ? 'Scale / offset' : 'المقياس / الإزاحة'});
    await expect(scaleOffset).toContainText('0.0001 / 0');

    // M2 quality evidence is presented as returned evidence, not as a fabricated score.
    const qualityHeading = locale === 'en' ? 'Quality evidence' : 'أدلة الجودة';
    await expect(page.getByRole('heading', {name: qualityHeading})).toBeVisible();
    await expect(page.locator('.evidence-chart')).toHaveAttribute('aria-label', locale === 'en'
      ? 'Valid AOI coverage by evaluated acquisition date'
      : 'التغطية الصالحة لمنطقة الاهتمام حسب تاريخ الالتقاط المقيّم');
    await expect(page.getByText(locale === 'en'
      ? 'Bars show returned coverage only; they are not a quality score, ranking, or scientific suitability claim.'
      : 'تعرض الأشرطة التغطية المعادة فقط؛ وليست درجة جودة أو ترتيباً أو ادعاءً بالملاءمة العلمية.')).toBeVisible();
    await expect(page.locator('.result-fact', {hasText: locale === 'en' ? 'Contract version' : 'إصدار العقد'})).toContainText('0.1.0');

    const limitationText = locale === 'en'
      ? 'The effective analysis resolution was 20 m due to a lower-resolution source band.'
      : 'كانت الدقة الفعلية للتحليل 20 متراً بسبب نطاق مصدر أقل دقة.';
    await expect(page.getByText(limitationText)).toBeVisible();

    const unrecognizedFailureText = locale === 'en'
      ? 'The backend reported a failure reason that this web version does not recognize.'
      : 'أبلغت الواجهة الخلفية عن سبب فشل لا يتعرف عليه هذا الإصدار من التطبيق.';

    // A limitation code this catalogue does not recognize renders the limitation fallback, never
    // the (differently worded) scene failure-reason fallback (W11 gap #4).
    const unrecognizedLimitationText = locale === 'en'
      ? 'The backend reported a limitation that this web version does not recognize.'
      : 'أبلغت الواجهة الخلفية عن قيد لا يتعرف عليه هذا الإصدار من التطبيق.';
    await expect(page.getByText(unrecognizedLimitationText)).toBeVisible();

    // R1: the selected date reads "Selected", never a failure sentence.
    const selectedRow = page.locator('.scene-list li', {hasText: '2026-08-30'});
    await expect(selectedRow.getByText(locale === 'en' ? 'Selected' : 'مختار')).toBeVisible();
    await expect(selectedRow.getByText(unrecognizedFailureText)).toHaveCount(0);

    // R1: an eligible-but-not-selected date with rejection_reason === null must not claim the
    // backend reported any failure or unrecognized reason — only that it was not selected.
    const nullReasonRow = page.locator('.scene-list li', {hasText: '2026-08-25'});
    await expect(nullReasonRow.getByText(locale === 'en' ? 'Not selected' : 'لم يُختر')).toBeVisible();
    await expect(nullReasonRow.getByText(unrecognizedFailureText)).toHaveCount(0);

    // A genuinely unrecognized non-null reason code still shows the honest unknown-reason
    // fallback, distinct from the null case directly above (W11 gap #4).
    const unknownReasonRow = page.locator('.scene-list li', {hasText: '2026-08-20'});
    await expect(unknownReasonRow.getByText(unrecognizedFailureText)).toBeVisible();

    // W14: a real top-level-only code (`NDVI_OUT_OF_RANGE_PIXELS_REJECTED`) placed in the per-date
    // slot must also fall back honestly, never render its own top-level `limitations[].code` text —
    // the per-date and run-level/limitation reason vocabularies are disjoint.
    const wrongVocabularyRow = page.locator('.scene-list li', {hasText: '2026-08-18'});
    await expect(wrongVocabularyRow.getByText(unrecognizedFailureText)).toBeVisible();
    const ndviLimitationText = locale === 'en'
      ? 'NDVI pixels outside the valid range were excluded.'
      : 'استُبعدت بكسلات NDVI الواقعة خارج النطاق الصالح.';
    await expect(wrongVocabularyRow.getByText(ndviLimitationText)).toHaveCount(0);
  });
}

// W12 (Council finding F1), corrected under W13 (independent review BLOCK): the backend publishes
// acquisition/coverage reason codes as top-level result limitations, not only as per-scene
// rejection_reason values. NO_SCENES_FOUND_ID exercises the empty-catalogue cause; the two
// NO_ELIGIBLE_ACQUISITION ids below exercise the two real, distinct causes the pinned pipeline can
// produce that same top-level code from (a below-guard rejection with coverage defined, and a
// tile-limit/BOA-offset rejection with coverage never computed) — both must render the same
// cause-neutral text, proving it is truthful for either (BLOCK point 1). This also asserts the
// surrounding A17-shaped INSUFFICIENT-evidence, no-statistics, no-artifact presentation is
// unchanged, including the no-artifact preview notice (BLOCK point 3).
const insufficientLimitationCases = [
  {
    label: 'NO_SCENES_FOUND',
    id: NO_SCENES_FOUND_ID,
    en: 'The catalogue returned no scenes for this area and date range.',
    ar: 'لم يُعد الفهرس مشاهد لهذه المنطقة والنطاق الزمني.'
  },
  {
    label: 'NO_ELIGIBLE_ACQUISITION (below-guard cause)',
    id: NO_ELIGIBLE_ACQUISITION_ID,
    en: 'No evaluated acquisition date qualified for selection.',
    ar: 'لم يتأهل أي تاريخ التقاط جرى تقييمه للاختيار.'
  },
  {
    label: 'NO_ELIGIBLE_ACQUISITION (undefined-coverage cause)',
    id: NO_ELIGIBLE_ACQUISITION_UNDEFINED_COVERAGE_ID,
    en: 'No evaluated acquisition date qualified for selection.',
    ar: 'لم يتأهل أي تاريخ التقاط جرى تقييمه للاختيار.'
  }
];

for (const locale of ['en', 'ar'] as const) {
  for (const limitationCase of insufficientLimitationCases) {
    test(`A17-shaped INSUFFICIENT result renders the shipped ${limitationCase.label} limitation translation in ${locale} (W12 F1 / W13)`, async ({page}) => {
      await page.goto(`/${locale}/analysis/${limitationCase.id}`);

      const expectedLimitationText = locale === 'en' ? limitationCase.en : limitationCase.ar;
      await expect(page.getByText(expectedLimitationText)).toBeVisible();

      const fallbackText = locale === 'en'
        ? 'The backend reported a limitation that this web version does not recognize.'
        : 'أبلغت الواجهة الخلفية عن قيد لا يتعرف عليه هذا الإصدار من التطبيق.';
      await expect(page.getByText(fallbackText)).toHaveCount(0);

      const insufficientText = locale === 'en'
        ? 'Evidence status: insufficient; no observation date yielded a scientifically usable NDVI result.'
        : 'حالة الأدلة: غير كافية؛ لم ينتج عن أي تاريخ رصد نتيجة NDVI قابلة للاستخدام علمياً.';
      await expect(page.getByText(insufficientText)).toBeVisible();

      const statisticsUnavailableText = locale === 'en'
        ? 'The result contains no AOI-level NDVI statistics.'
        : 'لا تتضمن النتيجة إحصاءات NDVI على مستوى منطقة الاهتمام.';
      await expect(page.getByText(statisticsUnavailableText)).toBeVisible();

      // W13 BLOCK point 3: these fixtures carry `artifacts: []` (no committed ndvi_preview), and
      // no prior assertion covered that the preview panel says so honestly rather than silently
      // showing nothing.
      const noArtifactText = locale === 'en'
        ? 'The backend result contains no ready NDVI preview artifact. No map layer is shown.'
        : 'لا تحتوي نتيجة الواجهة الخلفية على ملف معاينة NDVI جاهز. لن تُعرض طبقة على الخريطة.';
      await expect(page.getByText(noArtifactText)).toBeVisible({timeout: 15_000});
    });
  }
}

for (const locale of ['en', 'ar'] as const) {
  test(`a selected acquisition with zero valid NDVI pixels renders its own NO_VALID_PIXEL_IN_SELECTED_DATE limitation translation in ${locale} (W13)`, async ({page}) => {
    await page.goto(`/${locale}/analysis/${NO_VALID_PIXEL_ID}`);

    const expectedLimitationText = locale === 'en'
      ? 'The selected acquisition yielded no valid NDVI pixel.'
      : 'لم يُسفر الالتقاط المختار عن أي بكسل NDVI صالح.';
    await expect(page.getByText(expectedLimitationText)).toBeVisible();

    const fallbackText = locale === 'en'
      ? 'The backend reported a limitation that this web version does not recognize.'
      : 'أبلغت الواجهة الخلفية عن قيد لا يتعرف عليه هذا الإصدار من التطبيق.';
    await expect(page.getByText(fallbackText)).toHaveCount(0);

    // Unlike the no-eligible-date cases above, this fixture DID select a date (`selected: true`,
    // a real `effective_coverage.acquisition_date`) — only its NDVI computation yielded zero valid
    // pixels, so the selected-date row must read "Selected", never a failure/unknown sentence.
    const selectedRow = page.locator('.scene-list li', {hasText: '2026-08-30'});
    await expect(selectedRow.getByText(locale === 'en' ? 'Selected' : 'مختار')).toBeVisible();
  });
}

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
