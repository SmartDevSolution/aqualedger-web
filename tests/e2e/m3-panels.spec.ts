import {createHash} from 'node:crypto';
import {expect, test, type Page} from '@playwright/test';
import {
  M3_NOT_SCORED_ID,
  M3_SCORED_ID,
  M3_SLOW_DELAY_MS,
  M3_SLOW_ID,
  fixtureResultSha256
} from '../fixtures/backend-double';
import {canonicalJson, computeCardId, computeResultSha256} from '../../src/lib/api/result-hash';

// M3-5: bilingual zone priority/evidence panel, history drawer, decision card and print view. All
// numbers are the labelled test-double fixture (tests/fixtures/backend-double.ts), never a
// production claim. The fixture's `result_sha256` is computed by an independent implementation in
// the double, so these tests cross-check the web's verifier rather than the web against itself.

const DENYLIST = /theft|steal|stolen|fraud|penalt|illegal|violation|سرق|احتيال|غرام|عقوب|مخالف/i;

// Per-page observation (tests run fullyParallel against one shared backend double, so neither the
// double's global request log nor any global mode is safe to assert on): count POSTs this page made.
function trackPosts(page: Page): {count: () => number} {
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/analyses')) posts += 1;
  });
  return {count: () => posts};
}

// A history state scoped to ONE page: the relay response for `GET /api/analyses` is replaced in
// this page's network layer only, with the backend's own error envelope shape.
async function stubHistory(page: Page, mode: 'empty' | 'error' | 'unauthorized') {
  await page.route(/\/api\/analyses(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    if (mode === 'empty') return route.fulfill({status: 200, json: {items: [], next_cursor: null}});
    const [status, code] = mode === 'error' ? [503, 'SOURCE_UNAVAILABLE'] : [401, 'UNAUTHENTICATED'];
    return route.fulfill({status, json: {error: {code, params: {}, request_id: 'req-stub-1'}}});
  });
}

async function servedSha(page: Page, id: string): Promise<{body: Record<string, unknown>; sha: string}> {
  const response = await page.request.get(`/api/analyses/${id}/result`);
  const body = await response.json() as Record<string, unknown>;
  return {body, sha: (body.result_identity as {result_sha256: string}).result_sha256};
}

for (const locale of ['en', 'ar'] as const) {
  const L = (en: string, ar: string) => (locale === 'en' ? en : ar);

  test.describe(`zone panel in ${locale}`, () => {
    test('orders RANKED zones, groups UNRANKED by reason and keeps the two axes separate', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      await expect(page.locator('html')).toHaveAttribute('dir', L('ltr', 'rtl'));
      const panel = page.locator('.zone-panel');
      await expect(panel).toBeVisible();

      // Ordering: rank 1 then rank 2; unranked zones are in their own grouped section.
      const rankedIds = await panel.locator('.zone-row[data-ranked="true"]').evaluateAll(
        (rows) => rows.map((row) => (row as HTMLElement).dataset.zoneId));
      expect(rankedIds).toEqual(['Z-1', 'Z-3']);
      const groups = await panel.getByTestId('unranked-group').evaluateAll(
        (nodes) => nodes.map((node) => (node as HTMLElement).dataset.reason));
      expect(groups).toEqual(['FUTURE_CODE_X', 'MANDATORY_INPUT_MISSING']);

      // Priority class: stated as not established; never an H/M/L priority.
      await expect(page.getByTestId('priority-class-banner')).toContainText('aq-scorecard-1');
      await expect(page.getByTestId('priority-class-banner')).toContainText(L('Priority class not established', 'فئة الأولوية غير محددة'));
      await expect(panel.getByText(/priority:\s*(high|medium|low)/i)).toHaveCount(0);

      // Z-1: sequential rank-group chip; the evidence-quality class is a separate badge that
      // names its axis and is marked uncalibrated; the two never share a colour.
      const z1 = panel.locator('.zone-row[data-zone-id="Z-1"]');
      const chip = z1.locator('.rank-chip');
      await expect(chip).toHaveAttribute('data-rank-group', '1');
      const badge = z1.getByTestId('evidence-quality-badge');
      await expect(badge).toHaveAttribute('data-class', 'HIGH');
      await expect(badge).toContainText(L('uncalibrated', 'غير معايرة'));
      await expect(badge).toContainText('0.81');
      const colours = await page.evaluate(() => {
        const row = document.querySelector('.zone-row[data-zone-id="Z-1"]')!;
        const chipBg = getComputedStyle(row.querySelector('.rank-chip')!).backgroundColor;
        const badgeBg = getComputedStyle(row.querySelector('[data-testid="evidence-quality-badge"]')!).backgroundColor;
        return {chipBg, badgeBg};
      });
      expect(colours.chipBg).not.toBe(colours.badgeBg);
      // Z-3: a LOW evidence class sits next to a rank-2 chip of a DIFFERENT ramp step, and neither is a priority.
      const z3 = panel.locator('.zone-row[data-zone-id="Z-3"]');
      await expect(z3.getByTestId('evidence-quality-badge')).toHaveAttribute('data-class', 'LOW');
      const bg1 = await chip.evaluate((node) => getComputedStyle(node).backgroundColor);
      const bg3 = await z3.locator('.rank-chip').evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(bg1).not.toBe(bg3);

      // UNRANKED: neutral chip, no rank, no class badge value, typed reason text.
      const z2 = panel.locator('.zone-row[data-zone-id="Z-2"]');
      await expect(z2.getByTestId('unranked-chip')).toBeVisible();
      await expect(z2.getByTestId('evidence-quality-badge')).toHaveAttribute('data-class', 'none');
      await expect(z2.getByText(L('Insufficient data — this is not a low class', 'بيانات غير كافية — وهذا ليس فئة منخفضة'))).toBeVisible();
      await expect(z2.locator('[data-reason-code="MANDATORY_INPUT_MISSING"]')).toContainText('chirps');

      // Council condition 1: an UNRANKED zone whose payload carries class HIGH / c 0.90 shows neither.
      const z4Badge = panel.locator('.zone-row[data-zone-id="Z-4"]').getByTestId('evidence-quality-badge');
      await expect(z4Badge).toHaveAttribute('data-class', 'none');
      await expect(z4Badge).not.toContainText('0.90');
      await expect(z4Badge).not.toContainText(L('High', 'مرتفعة'));

      // An unknown backend code falls back to the generic template with the analysis id as reference.
      const z4 = panel.locator('.zone-row[data-zone-id="Z-4"]');
      await expect(z4.locator('[data-reason-code="FUTURE_CODE_X"]')).toContainText('FUTURE_CODE_X');
      await expect(z4.locator('[data-reason-code="FUTURE_CODE_X"]')).toContainText(M3_SCORED_ID);
      await expect(z4.getByText(L('alternative explanation this version does not recognize', 'تفسير بديل لا تتعرف عليه هذه النسخة'), {exact: false})).toBeVisible();

      // Guardrail text and the denylist (no theft/fraud/penalty wording) over the whole result region.
      await expect(page.getByTestId('zone-guardrail')).toHaveText(L(
        'Decision support for field verification — not enforcement, not a confirmed diagnosis.',
        'دعم قرار للتحقق الميداني — ليس إنفاذًا ولا تشخيصًا مؤكدًا.'));
      expect(await page.locator('.result-panel').innerText()).not.toMatch(DENYLIST);
    });

    test('shows families with same-family collapse, confounders, and all twelve factor rows', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      const z1 = page.locator('.zone-row[data-zone-id="Z-1"]');
      const optical = z1.locator('.chip[data-family="OPTICAL"]');
      await expect(optical).toHaveAttribute('data-counted', 'true');
      await expect(optical).toContainText(L('2 sources count as one family', 'تُحتسب 2 مصادر كعائلة واحدة'));
      await expect(z1.locator('.chip[data-family="SAR"]')).toHaveAttribute('data-counted', 'false');
      await expect(z1.locator('.chip[data-confounder="GROWTH_STAGE"]')).toContainText(L('not measured here', 'غير مقيس هنا'));
      await expect(z1.locator('.chip[data-confounder="WEATHER"]')).toContainText(L('assessed', 'مُقيَّم'));

      await z1.locator('.technical-view summary').click();
      const rows = z1.getByTestId('factor-table').locator('tbody tr');
      await expect(rows).toHaveCount(12);
      const ids = await rows.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.factorId));
      expect(ids).toEqual(['M1', 'M2', 'M3', 'M4', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8']);
      await expect(rows.nth(7)).toContainText(L('Not assessed', 'غير مُقيَّم')); // O4
      await expect(rows.nth(9)).toContainText(L('Not applicable', 'لا ينطبق')); // O6
      // Top three reasons only on the row; the full evidence quality carries C/M/O verbatim.
      await expect(z1.locator('.technical-view')).toContainText('0.8125');
      await expect(z1.locator('.technical-view')).toContainText(L('Rule-based evidence-quality class — uncalibrated.', 'فئة جودة أدلة قاعدية — غير معايرة.'));
    });

    test('the factor link selects its zone and scopes the time-series view to that zone only', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      await expect(page.getByTestId('no-zone-selected')).toBeVisible();
      await page.locator('.zone-row[data-zone-id="Z-1"] .technical-view summary').click();
      await page.locator('.zone-row[data-zone-id="Z-1"] [data-testid="factor-table"] tbody tr').first().getByRole('button').click();
      await expect(page).toHaveURL(/[?&]zone=Z-1\b/);
      const evidence = page.getByTestId('zone-evidence');
      await expect(evidence).toHaveAttribute('data-zone-id', 'Z-1');
      await expect(evidence.locator('[data-indicator="NDVI"] tbody tr')).toHaveCount(3);
      await expect(evidence.locator('[data-observation-class="MISSING"]')).toContainText('NO_OBSERVATION_IN_WINDOW');
      await expect(evidence.locator('[data-indicator="RAINFALL"]')).toBeVisible();

      await page.locator('.zone-row[data-zone-id="Z-3"] .zone-select').click();
      await expect(page).toHaveURL(/[?&]zone=Z-3\b/);
      await expect(page.getByTestId('zone-evidence')).toHaveAttribute('data-zone-id', 'Z-3');
      await expect(page.getByTestId('zone-evidence').locator('[data-indicator="NDVI"] tbody tr')).toHaveCount(1);
      await expect(page.getByTestId('zone-evidence').locator('[data-indicator="RAINFALL"]')).toHaveCount(0);
    });

    test('numbers and dates use Latin digits and Gregorian dates; ids stay LTR', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?zone=Z-1&panel=card`);
      const text = await page.locator('.result-panel').innerText();
      expect(text).not.toMatch(/[٠-٩۰-۹]/);
      await expect(page.getByTestId('card-analysis-id')).toHaveText(M3_SCORED_ID);
      expect(await page.getByTestId('card-analysis-id').evaluate((node) => getComputedStyle(node).direction)).toBe('ltr');
      await expect(page.getByTestId('decision-card')).toContainText('2026');
    });

    test('the page does not scroll horizontally with the panel, card and drawer open', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?zone=Z-1&panel=card&history=1`);
      await expect(page.getByTestId('decision-card')).toBeVisible();
      await expect(page.getByTestId('history-drawer').locator('.history-item').first()).toBeVisible();
      await page.locator('.zone-row[data-zone-id="Z-1"] .technical-view summary').click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('the not-established sentence is bound to the body priority_class_status', async ({page}) => {
      await page.route(`**/api/analyses/${M3_SCORED_ID}/result`, async (route) => {
        const response = await route.fetch();
        const body = await response.json() as {scoring: Record<string, unknown>};
        body.scoring.priority_class_status = 'ESTABLISHED_FUTURE';
        await route.fulfill({response, json: body});
      });
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      const banner = page.getByTestId('priority-class-banner');
      await expect(banner).toHaveAttribute('data-status', 'unrecognised');
      await expect(banner).toContainText('ESTABLISHED_FUTURE');
      await expect(banner).toContainText(L('No class is shown', 'لا تُعرض أي فئة'));
    });

    test('the map draws the zone layer and does not mirror under RTL', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?zone=Z-1`);
      await expect(page.locator('.map-canvas-wrap')).toHaveAttribute('dir', 'ltr');
      await page.waitForFunction(() => {
        const map = (window as unknown as {__AQUALEDGER_TEST_MAP__?: {getLayer: (id: string) => unknown}}).__AQUALEDGER_TEST_MAP__;
        return Boolean(map?.getLayer('scored-zones-ranked'));
      }, null, {timeout: 60_000});
      const layers = await page.evaluate(() => {
        const map = (window as unknown as {__AQUALEDGER_TEST_MAP__: {
          getLayer: (id: string) => unknown;
          getFilter: (id: string) => unknown;
          querySourceFeatures: (id: string) => {properties: Record<string, unknown>}[];
        }}).__AQUALEDGER_TEST_MAP__;
        return {
          ranked: Boolean(map.getLayer('scored-zones-ranked')),
          unranked: Boolean(map.getLayer('scored-zones-unranked')),
          selectedFilter: map.getFilter('scored-zones-selected')
        };
      });
      expect(layers.ranked).toBe(true);
      expect(layers.unranked).toBe(true);
      expect(JSON.stringify(layers.selectedFilter)).toContain('Z-1');
    });
  });

  test.describe(`decision card and identity in ${locale}`, () => {
    test('card identity is derived from the emitted hash and the independent recomputation agrees', async ({page}) => {
      const {body, sha} = await servedSha(page, M3_SCORED_ID);
      // Three implementations agree: the double's own digest, the web verifier, and Node's hash.
      expect(sha).toBe(fixtureResultSha256(body));
      expect(await computeResultSha256(body)).toBe(sha);
      const nodeDirect = createHash('sha256').update(canonicalJson({
        analysis_id: body.analysis_id, execution_status: body.execution_status, scoring: body.scoring, assessment: body.assessment
      }), 'utf8').digest('hex');
      expect(nodeDirect).toBe(sha);
      const cardId = createHash('sha256').update(`aq-card-1|${M3_SCORED_ID}|${sha}`, 'utf8').digest('hex');
      expect(await computeCardId(M3_SCORED_ID, sha)).toBe(cardId);

      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      await expect(page.getByTestId('result-sha256')).toHaveText(sha.slice(0, 12));
      await expect(page.getByTestId('result-identity')).toContainText(L('matches', 'مطابقة'));
      await expect(page.getByTestId('decision-card')).toHaveCount(0);
      await page.getByRole('button', {name: L('Open decision card', 'فتح بطاقة القرار')}).click();
      const card = page.getByTestId('decision-card');
      await expect(card).toBeVisible();
      await expect(page).toHaveURL(/[?&]panel=card\b/);
      await expect(page.getByTestId('card-id')).toHaveText(cardId);
      await expect(card).toHaveAttribute('data-result-sha256', sha);
      await expect(page.getByTestId('card-result-sha256')).toHaveText(sha.slice(0, 12));
      await expect(page.getByTestId('card-guardrail')).toContainText(L('not enforcement', 'ليس إنفاذًا'));
      expect(await card.innerText()).not.toMatch(DENYLIST);
    });

    test('print view repeats analysis id, short hash, method and scoring time as real text', async ({page}) => {
      const {sha} = await servedSha(page, M3_SCORED_ID);
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?panel=card`);
      await expect(page.getByTestId('decision-card')).toBeVisible();
      await page.emulateMedia({media: 'print'});
      const header = page.locator('.print-header');
      const footer = page.locator('.print-footer');
      await expect(header).toBeVisible();
      await expect(footer).toBeVisible();
      await expect(header).toContainText(M3_SCORED_ID);
      await expect(footer).toContainText(sha.slice(0, 12));
      await expect(footer).toContainText('aq-scorecard-1');
      await expect(footer).toContainText('2026');
      // Interactive chrome and the map/input panels are not printed; the card is.
      await expect(page.locator('.site-header')).toBeHidden();
      await expect(page.locator('.workspace-grid')).toBeHidden();
      await expect(page.locator('.no-print').first()).toBeHidden();
      await expect(page.getByTestId('decision-card')).toBeVisible();
      expect(await page.locator('.print-header').evaluate((node) => getComputedStyle(node).position)).toBe('fixed');
      // Real text: the localized section heading is in the DOM text, not an image.
      await expect(page.getByRole('heading', {name: L('Ranked zones', 'المناطق المرتبة')}).last()).toBeVisible();
      // The PDF is produced from the same text layer.
      const pdf = await page.pdf({format: 'A4', printBackground: true});
      expect(pdf.byteLength).toBeGreaterThan(2000);
    });

    test('a not-scored result offers no card', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_NOT_SCORED_ID}?panel=card`);
      await expect(page.getByTestId('decision-card')).toHaveCount(0);
      await expect(page.getByRole('button', {name: L('Open decision card', 'فتح بطاقة القرار')})).toHaveCount(0);
    });
  });

  test.describe(`language switch in ${locale}`, () => {
    test('keeps analysis id, zone, panel and the same result hash, with no POST', async ({page}) => {
      const posts = trackPosts(page);
      const {sha} = await servedSha(page, M3_SCORED_ID);
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?zone=Z-3&panel=card`);
      await expect(page.getByTestId('decision-card')).toBeVisible();
      await expect(page.locator('.zone-row[data-zone-id="Z-3"]')).toHaveClass(/is-selected/);
      await expect(page.getByTestId('result-sha256')).toHaveText(sha.slice(0, 12));

      const other = locale === 'en' ? 'ar' : 'en';
      await page.locator('.language-switcher').click();
      await expect(page).toHaveURL(new RegExp(`/${other}/analysis/${M3_SCORED_ID}\\?.*zone=Z-3`));
      await expect(page).toHaveURL(/panel=card/);
      await expect(page.locator('html')).toHaveAttribute('lang', other);
      await expect(page.locator('html')).toHaveAttribute('dir', other === 'ar' ? 'rtl' : 'ltr');
      await expect(page.locator('.zone-row[data-zone-id="Z-3"]')).toHaveClass(/is-selected/);
      await expect(page.getByTestId('decision-card')).toBeVisible();
      await expect(page.getByTestId('result-sha256')).toHaveText(sha.slice(0, 12));
      await expect(page.getByTestId('decision-card')).toHaveAttribute('data-result-sha256', sha);

      expect(posts.count()).toBe(0);
    });
  });

  test.describe(`history drawer in ${locale}`, () => {
    test('lists saved analyses with cursor load-more; opening one is a GET, never a POST', async ({page}) => {
      const posts = trackPosts(page);
      const resultGets: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'GET') resultGets.push(new URL(request.url()).pathname);
      });
      await page.goto(`/${locale}/analysis/${M3_NOT_SCORED_ID}`);
      await page.getByRole('button', {name: L('Recent analyses', 'التحليلات الحديثة')}).click();
      const drawer = page.getByTestId('history-drawer');
      await expect(drawer).toBeVisible();
      await expect(page).toHaveURL(/[?&]history=1\b/);
      await expect(drawer.locator('.history-item')).toHaveCount(2);
      await expect(drawer.locator(`[data-analysis-id="${M3_SCORED_ID}"]`)).toContainText(L('2 ranked · 2 unranked', '2 مرتبة · 2 غير مرتبة'));
      await expect(drawer.locator(`[data-analysis-id="${M3_NOT_SCORED_ID}"]`)).toContainText(L('Currently open', 'مفتوح حاليًا'));
      await expect(drawer.locator(`[data-analysis-id="${M3_NOT_SCORED_ID}"]`)).toContainText(L('Not scored under method', 'غير مُقيَّم بطريقة'));
      await expect(page.getByTestId('history-draft-note')).toContainText(L('does not change or submit your draft', 'لا يغيّر مضلع المسودة'));

      await drawer.getByRole('button', {name: L('Load more', 'تحميل المزيد')}).click();
      await expect(drawer.locator('.history-item')).toHaveCount(3);
      await expect(drawer.getByRole('button', {name: L('Load more', 'تحميل المزيد')})).toHaveCount(0);

      await drawer.locator(`[data-analysis-id="${M3_SCORED_ID}"] a`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/analysis/${M3_SCORED_ID}`));
      await expect(page.locator('.zone-panel')).toBeVisible();
      expect(posts.count()).toBe(0);
      expect(resultGets).toContain(`/api/analyses/${M3_SCORED_ID}/result`);
    });

    for (const mode of ['empty', 'error', 'unauthorized'] as const) {
      test(`renders the ${mode} state`, async ({page}) => {
        await stubHistory(page, mode);
        {
          await page.goto(`/${locale}/analysis?history=1`);
          const drawer = page.getByTestId('history-drawer');
          if (mode === 'empty') {
            await expect(drawer.getByTestId('history-empty')).toHaveText(L('No saved analyses for this account yet.', 'لا توجد تحليلات محفوظة لهذا الحساب بعد.'));
          } else if (mode === 'error') {
            await expect(drawer.getByTestId('history-error')).toContainText(L('could not be loaded', 'تعذّر تحميل'));
            await expect(drawer.getByRole('button', {name: L('Try again', 'حاول مرة أخرى')})).toBeVisible();
          } else {
            await expect(drawer.getByTestId('history-error')).toContainText(L('not authorized', 'غير مخوّلة'));
            await expect(drawer.getByRole('button', {name: L('Try again', 'حاول مرة أخرى')})).toHaveCount(0);
          }
        }
      });
    }

    test('the drawer preserves a draft polygon and says so', async ({page}) => {
      const polygon = JSON.stringify({type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]});
      await page.goto(`/${locale}/analysis`);
      await page.locator('.coordinate-entry summary').click();
      await page.getByLabel(L('Polygon GeoJSON', 'GeoJSON للمضلع')).fill(polygon);
      await page.getByRole('button', {name: L('Use polygon', 'استخدم المضلع')}).click();
      await page.getByRole('button', {name: L('Recent analyses', 'التحليلات الحديثة')}).click();
      await expect(page.getByTestId('history-draft-note')).toContainText(L('draft polygon in this tab', 'مضلع مسودة في هذا التبويب'));
      await page.getByTestId('history-drawer').locator(`[data-analysis-id="${M3_SCORED_ID}"] a`).click();
      await expect(page).toHaveURL(new RegExp(`/analysis/${M3_SCORED_ID}`));
      await expect(page.locator('#aoi-geojson')).toBeAttached();
      await page.locator('.coordinate-entry summary').click();
      await expect(page.locator('#aoi-geojson')).toHaveValue(/"coordinates"/);
    });
  });
}

test('a late response for another analysis id is discarded, never shown under the new id', async ({page}) => {
  await page.goto(`/en/analysis/${M3_SLOW_ID}?history=1`);
  const drawer = page.getByTestId('history-drawer');
  await expect(drawer.locator('.history-item').first()).toBeVisible();
  // Navigate to a different saved analysis while the slow result is still in flight.
  await drawer.locator(`[data-analysis-id="${M3_SCORED_ID}"] a`).click();
  await expect(page).toHaveURL(new RegExp(`/analysis/${M3_SCORED_ID}`));
  await expect(page.locator('.zone-panel')).toBeVisible();
  const shown = await page.getByTestId('result-sha256').innerText();
  // Wait out the slow response and prove it never replaced or mixed into the visible result.
  await page.waitForTimeout(M3_SLOW_DELAY_MS + 1500);
  await expect(page.getByTestId('result-sha256')).toHaveText(shown);
  await expect(page.locator('.zone-row[data-zone-id="Z-1S"]')).toHaveCount(0);
  await expect(page.locator('.zone-row[data-zone-id="Z-1"]')).toHaveCount(1);
  await expect(page.locator('.result-id')).toHaveText(M3_SCORED_ID);
});

test('draft form changes never alter the displayed scored result', async ({page}) => {
  await page.goto(`/en/analysis/${M3_SCORED_ID}`);
  await expect(page.getByTestId('result-identity')).toContainText('matches');
  const before = await page.locator('.zone-panel').innerText();
  await page.locator('#start-date').fill('2026-01-01');
  await page.locator('#end-date').fill('2026-02-01');
  expect(await page.locator('.zone-panel').innerText()).toBe(before);
  await expect(page.getByTestId('result-sha256')).toBeVisible();
});

test('settings states the scoring method without a priority class, in both languages', async ({page}) => {
  await page.goto('/en/settings');
  await expect(page.getByText('priority class not established', {exact: false})).toBeVisible();
  await page.goto('/ar/settings');
  await expect(page.getByText('فئة الأولوية غير محددة', {exact: false})).toBeVisible();
});
