import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {expect, test, type Page} from '@playwright/test';
import {
  M3_CARD_PROJECTION_ID,
  M3_CONTRADICTORY_LIMITED_RANKED_ID,
  M3_LIMITED_UNRANKED_ID,
  M3_NOT_SCORED_ID,
  M3_PERSISTENCE_INELIGIBLE_AGRI_MASK_ID,
  M3_PERSISTENCE_INELIGIBLE_BASELINE_ID,
  M3_PERSISTENCE_INELIGIBLE_GAPS_ID,
  M3_SCORED_ID,
  M3_SLOW_DELAY_MS,
  M3_SLOW_ID,
  fixtureResultSha256
} from '../fixtures/backend-double';
import {canonicalJson, computeCardId, computeResultSha256} from '../../src/lib/api/result-hash';
import {formatGregorianDate, formatPercent, formatValue} from '../../src/lib/format';

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

// Serve one analysis result with a mutation applied, keeping the emitted identity truthful: the
// digest is recomputed from the mutated payload with the web's own canonicalization, so the test
// exercises the reader's rules on a body that is self-consistent apart from the mutation itself.
async function serveMutated(page: Page, id: string, mutate: (body: Record<string, unknown>) => void) {
  await page.route(`**/api/analyses/${id}/result`, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as Record<string, unknown>;
    mutate(body);
    const identity = body.result_identity as Record<string, unknown> | undefined;
    if (identity) identity.result_sha256 = (await computeResultSha256(body)) ?? '';
    await route.fulfill({response, json: body});
  });
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
      // Z-3: the VALID ranked-LOW case (DR-M3-01 §3: a RANKED zone carries `SUFFICIENT`) — a LOW
      // evidence class next to a rank-2 chip of a DIFFERENT ramp step, and neither is a priority.
      // The row's own evidence status is cross-checked here: a ranked zone that is not SUFFICIENT is
      // the contradictory combination that must never be presented as a ranking (see the LIMITED
      // and contradictory-body regressions below).
      const z3 = panel.locator('.zone-row[data-zone-id="Z-3"]');
      await expect(z3).toHaveAttribute('data-ranked', 'true');
      await expect(z3).toContainText(`${L('Zone evidence', 'أدلة المنطقة')}: ${L('Sufficient', 'كافية')}`);
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
      // A missing window is explained in the reader's language; the raw M2 code is a diagnostic on
      // the localized sentence, never the whole cell (see the dedicated missing-reason test).
      await expect(evidence.locator('[data-indicator="NDVI"] tbody tr[data-observation-class="MISSING"]')).toContainText(L(
        'The source payload contained no valid pixel.',
        'لم تتضمن بيانات المصدر أي بكسل صالح.'));
      await expect(evidence.locator('[data-indicator="RAINFALL"]')).toBeVisible();

      await page.locator('.zone-row[data-zone-id="Z-3"] .zone-select').click();
      await expect(page).toHaveURL(/[?&]zone=Z-3\b/);
      await expect(page.getByTestId('zone-evidence')).toHaveAttribute('data-zone-id', 'Z-3');
      await expect(page.getByTestId('zone-evidence').locator('[data-indicator="NDVI"] tbody tr')).toHaveCount(1);
      await expect(page.getByTestId('zone-evidence').locator('[data-indicator="RAINFALL"]')).toHaveCount(0);
    });

    test('the analytical evidence bar keeps the same visual edge when switching locale', async ({page}) => {
      // Round-5 C-03: RTL changes the surrounding layout, never the plot axis. The second NDVI
      // value is non-full-width and therefore exposes whether the bar anchored left or right.
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?zone=Z-1`);
      const row = page.locator('.zone-evidence [data-indicator="NDVI"] .evidence-chart-row').nth(1);
      await expect(row).toBeVisible();
      const geometry = async () => page.locator('.zone-evidence [data-indicator="NDVI"] .evidence-chart-row').nth(1).evaluate((node) => {
        const track = node.querySelector('.evidence-chart-track')!.getBoundingClientRect();
        const bar = node.querySelector('.evidence-chart-bar')!.getBoundingClientRect();
        return {direction: getComputedStyle(node.querySelector('.evidence-chart-track')!).direction, leftInset: bar.left - track.left, rightInset: track.right - bar.right, trackWidth: track.width, barWidth: bar.width};
      });
      const before = await geometry();
      expect(before.direction).toBe('ltr');
      expect(before.barWidth).toBeGreaterThan(0);
      expect(before.barWidth).toBeLessThan(before.trackWidth);
      await page.locator('.language-switcher').click();
      const other = locale === 'en' ? 'ar' : 'en';
      await expect(page).toHaveURL(new RegExp(`/${other}/analysis/${M3_SCORED_ID}`));
      const after = await geometry();
      expect(after.direction).toBe('ltr');
      expect(after.barWidth / after.trackWidth).toBeCloseTo(before.barWidth / before.trackWidth, 2);
      expect(after.leftInset / after.trackWidth).toBeCloseTo(before.leftInset / before.trackWidth, 2);
      expect(after.rightInset / after.trackWidth).toBeCloseTo(before.rightInset / before.trackWidth, 2);
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
      await serveMutated(page, M3_SCORED_ID, (body) => {
        (body.scoring as Record<string, unknown>).priority_class_status = 'ESTABLISHED_FUTURE';
      });
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      const banner = page.getByTestId('priority-class-banner');
      await expect(banner).toHaveAttribute('data-status', 'unrecognised');
      // The reported value is quoted verbatim...
      await expect(banner).toContainText('ESTABLISHED_FUTURE');
      // ...and the notice states that no class is shown, without restating the unrecognized status
      // as the method's concluded "not established" (the v1 ruling belongs to NOT_ESTABLISHED only).
      await expect(banner).toContainText(L('no priority class is shown', 'لا تُعرض أي فئة أولوية'));
      await expect(banner).not.toContainText(L('Priority class not established', 'فئة الأولوية غير محددة'));
      // Nothing on the page gains a class from an unrecognized status.
      await expect(page.locator('.zone-panel').getByText(/priority:\s*(high|medium|low)/i)).toHaveCount(0);

      // Round-3 F-02: the ROW renders the same `PRIORITY_CLASS_NOT_ESTABLISHED` reason code, so it
      // too must be bound to the body's own status — the fixed conclusion may not appear in the row
      // reason text, only the status-bound sentence.
      const fixedConclusion = L('Priority class not established', 'فئة الأولوية غير محددة');
      const fixedReasonSentence = 'A priority class is not established';
      const rowReason = page.locator('.zone-row[data-zone-id="Z-1"] [data-reason-code="PRIORITY_CLASS_NOT_ESTABLISHED"]');
      await expect(rowReason).toBeVisible();
      await expect(rowReason).not.toContainText(fixedConclusion);
      await expect(rowReason).not.toContainText(fixedReasonSentence);
      await expect(rowReason).toContainText('ESTABLISHED_FUTURE');
      await expect(rowReason).toContainText(L('No priority class is shown for this zone', 'لا تُعرض أي فئة أولوية لهذه المنطقة'));

      await page.getByRole('button', {name: L('Open decision card', 'فتح بطاقة القرار')}).click();
      const limitation = page.locator('[data-limitation="priority-class"]');
      await expect(limitation).toContainText('ESTABLISHED_FUTURE');
      await expect(limitation).not.toContainText(L('Priority class not established', 'فئة الأولوية غير محددة'));

      // ...and the CARD's zone reason text follows the same binding (same reason, same body).
      const cardReason = page.locator('.decision-card .card-zone[data-zone-id="Z-1"] [data-reason-code="PRIORITY_CLASS_NOT_ESTABLISHED"]');
      await expect(cardReason).toBeVisible();
      await expect(cardReason).not.toContainText(fixedConclusion);
      await expect(cardReason).not.toContainText(fixedReasonSentence);
      await expect(cardReason).toContainText('ESTABLISHED_FUTURE');
      await expect(cardReason).toContainText(L('No priority class is shown for this zone', 'لا تُعرض أي فئة أولوية لهذه المنطقة'));
    });

    test('an absent priority_class_status is reported as absent, never restated as not established', async ({page}) => {
      await serveMutated(page, M3_SCORED_ID, (body) => {
        delete (body.scoring as Record<string, unknown>).priority_class_status;
      });
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      const banner = page.getByTestId('priority-class-banner');
      await expect(banner).toHaveAttribute('data-status', 'absent');
      await expect(banner).toContainText(L('no priority status', 'بأي حالة أولوية'));
      await expect(banner).not.toContainText(L('Priority class not established', 'فئة الأولوية غير محددة'));
      // The row reason is bound to the absent status too (round-3 F-02).
      const rowReason = page.locator('.zone-row[data-zone-id="Z-1"] [data-reason-code="PRIORITY_CLASS_NOT_ESTABLISHED"]');
      await expect(rowReason).toBeVisible();
      await expect(rowReason).not.toContainText(L('not established', 'غير محددة'));
      await expect(rowReason).toContainText(L('No priority class is shown for this zone', 'لا تُعرض أي فئة أولوية لهذه المنطقة'));
      await page.getByRole('button', {name: L('Open decision card', 'فتح بطاقة القرار')}).click();
      const limitation = page.locator('[data-limitation="priority-class"]');
      await expect(limitation).toContainText(L('reported no priority status', 'لم تُبلّغ الطريقة'));
      await expect(limitation).not.toContainText(L('not established', 'غير محددة'));
      const cardReason = page.locator('.decision-card .card-zone[data-zone-id="Z-1"] [data-reason-code="PRIORITY_CLASS_NOT_ESTABLISHED"]');
      await expect(cardReason).not.toContainText(L('not established', 'غير محددة'));
      await expect(cardReason).toContainText(L('No priority class is shown for this zone', 'لا تُعرض أي فئة أولوية لهذه المنطقة'));
    });

    // DR-M3-01 §3, fail-closed: "LIMITED is not rankable". A body that ranks a zone the method did
    // not deem rankable is contract-invalid, so the whole result is refused — never partially read,
    // never rendered as a ranking.
    test('malformed M3 factors and incomplete result identity envelopes are refused', async ({page}) => {
      await serveMutated(page, M3_SCORED_ID, (body) => {
        const assessment = body.assessment as Array<Record<string, unknown>>;
        assessment[0]!.evidence_quality = {...assessment[0]!.evidence_quality as Record<string, unknown>, factors: null};
      });
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
      await expect(page.locator('.notice[role="alert"]').filter({hasText: L(
        'The backend response did not match the pinned result contract.',
        'لا تطابق استجابة الواجهة الخلفية عقد النتيجة المثبت.')})).toBeVisible();
      await expect(page.locator('.zone-panel')).toHaveCount(0);

      await page.unroute(`**/api/analyses/${M3_SCORED_ID}/result`);
      await serveMutated(page, M3_SCORED_ID, (body) => {
        delete body.result_identity;
      });
      await page.reload();
      await expect(page.locator('.notice[role="alert"]').filter({hasText: L(
        'The backend response did not match the pinned result contract.',
        'لا تطابق استجابة الواجهة الخلفية عقد النتيجة المثبت.')})).toBeVisible();
      await expect(page.locator('.zone-panel')).toHaveCount(0);

      await page.unroute(`**/api/analyses/${M3_SCORED_ID}/result`);
      await serveMutated(page, M3_SCORED_ID, (body) => {
        delete body.scoring;
        delete body.assessment;
      });
      await page.reload();
      await expect(page.locator('.notice[role="alert"]').filter({hasText: L(
        'The backend response did not match the pinned result contract.',
        'لا تطابق استجابة الواجهة الخلفية عقد النتيجة المثبت.')})).toBeVisible();
      await expect(page.locator('.zone-panel')).toHaveCount(0);
    });
    // DR-M3-01 §3, fail-closed: "LIMITED is not rankable". A body that ranks a zone the method did
    // not deem rankable is contract-invalid, so the whole result is refused — never partially read,
    // never rendered as a ranking.
    test('a body that ranks a zone with a non-SUFFICIENT evidence status is refused, never rendered', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_CONTRADICTORY_LIMITED_RANKED_ID}?panel=card`);
      const contractNotice = page.locator('.notice[role="alert"]').filter({hasText: L(
        'The backend response did not match the pinned result contract.',
        'لا تطابق استجابة الواجهة الخلفية عقد النتيجة المثبت.')});
      await expect(contractNotice).toBeVisible();
      // No M3 surface renders, so the contradictory combination can never be blessed anywhere.
      await expect(page.getByTestId('decision-card')).toHaveCount(0);
      await expect(page.locator('.zone-panel')).toHaveCount(0);
      await expect(page.locator('.zone-row')).toHaveCount(0);
      await expect(page.locator('.rank-chip')).toHaveCount(0);
      await expect(page.getByTestId('evidence-quality-badge')).toHaveCount(0);
      await expect(page.getByText('Z-1')).toHaveCount(0);
    });

    test('a LIMITED zone the method left UNRANKED stays neutral on the panel, the map and the card', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_LIMITED_UNRANKED_ID}?zone=Z-LIM&panel=card`);
      // Panel: no rank, no rank-group ramp, no class and no composite — even though the payload
      // carries `class: 'LOW'` and `c: '0.3000'`.
      const row = page.locator('.zone-row[data-zone-id="Z-LIM"]');
      await expect(row).toBeVisible();
      await expect(row).toHaveAttribute('data-ranked', 'false');
      await expect(row.getByTestId('unranked-chip')).toBeVisible();
      await expect(row.getByTestId('evidence-quality-badge')).toHaveAttribute('data-class', 'none');
      await expect(row.locator('[data-rank-group]')).toHaveCount(0);
      expect(await row.innerText()).not.toContain('0.3000');
      // Map: the zone is in the zone source, marked unranked, so the ranked layer's filter
      // (`ranked == true`) can never draw it.
      await page.waitForFunction(() => {
        const map = (window as unknown as {__AQUALEDGER_TEST_MAP__?: {getLayer: (id: string) => unknown}}).__AQUALEDGER_TEST_MAP__;
        return Boolean(map?.getLayer('scored-zones-unranked'));
      }, null, {timeout: 60_000});
      const mapState = await page.evaluate(() => {
        const map = (window as unknown as {__AQUALEDGER_TEST_MAP__: {
          getFilter: (id: string) => unknown;
          querySourceFeatures: (id: string) => {properties: Record<string, unknown>}[];
        }}).__AQUALEDGER_TEST_MAP__;
        return {
          rankedFilter: JSON.stringify(map.getFilter('scored-zones-ranked')),
          features: map.querySourceFeatures('scored-zones-source')
            .map((feature) => ({zoneId: feature.properties.zone_id, ranked: feature.properties.ranked}))
        };
      });
      expect(mapState.features).toContainEqual({zoneId: 'Z-LIM', ranked: false});
      expect(mapState.rankedFilter).toContain('ranked');
      // Card: the same neutrality, and no composite number.
      const cardZone = page.locator('.decision-card .card-zone[data-zone-id="Z-LIM"]');
      await expect(cardZone).toHaveAttribute('data-ranked', 'false');
      await expect(cardZone.getByTestId('evidence-quality-badge')).toHaveAttribute('data-class', 'none');
      await expect(cardZone.getByTestId('card-zone-rank-key')).toHaveCount(0);
      await expect(cardZone.getByTestId('card-zone-families')).toHaveCount(0);
      expect(await cardZone.innerText()).not.toContain('0.3000');
    });

    test('a missing-value reason is explained in the reader language, the raw code only as a diagnostic', async ({page}) => {
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?zone=Z-1`);
      const evidence = page.getByTestId('zone-evidence');
      await expect(evidence).toBeVisible();
      // A known pinned M2 code renders its localized explanation, not the bare code.
      const known = evidence.locator('[data-missing-reason="NO_VALID_PIXELS"]');
      await expect(known).toHaveText(L(
        'The source payload contained no valid pixel.',
        'لم تتضمن بيانات المصدر أي بكسل صالح.'));
      // An unknown reason is still explained in the reader's language and may carry the raw code
      // only as an ADDITIONAL isolated diagnostic.
      const unknown = evidence.locator('[data-missing-reason="FUTURE_MISSING_REASON"]');
      await expect(unknown).toContainText(L(
        'does not recognize the missing-value reason',
        'لا تتعرف هذه النسخة على سبب القيمة المفقودة'));
      await expect(unknown).toContainText('FUTURE_MISSING_REASON');
      expect(await unknown.innerText()).not.toBe('FUTURE_MISSING_REASON');
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

  // F1 regression (carried from the M3-4 correction f1426c2): PERSISTENCE_INELIGIBLE is an
  // eligibility gate. Neither prerequisite failure establishes that the stress was not persistent,
  // so the zone states the gate plus the sourced M2 cause and never a "not persistent" claim.
  for (const {label, id, cause} of [
    {label: 'NO_COMPATIBLE_BASELINE', id: M3_PERSISTENCE_INELIGIBLE_BASELINE_ID, cause: L('No compatible seasonal baseline is available.', 'لا يتوفر خط أساس موسمي متوافق.')},
    {label: 'EXCESSIVE_GAPS', id: M3_PERSISTENCE_INELIGIBLE_GAPS_ID, cause: L('The requested history has excessive gaps.', 'تحتوي السلسلة المطلوبة على فجوات مفرطة.')},
    {label: 'AGRICULTURAL_MASK_BLOCKED', id: M3_PERSISTENCE_INELIGIBLE_AGRI_MASK_ID, cause: L('Persistence is unavailable until an accepted agricultural mask and compatible baseline are available.', 'لا تتوفر الاستمرارية حتى يتوفر قناع زراعي مقبول وخط أساس متوافق.')}
  ]) {
    test(`PERSISTENCE_INELIGIBLE states the eligibility gate and cause, never a non-persistence claim in ${locale} (${label})`, async ({page}) => {
      await page.goto(`/${locale}/analysis/${id}`);
      const row = page.locator('.zone-row[data-zone-id="Z-9"]');
      await expect(row).toBeVisible();
      await expect(row).toContainText(L('Persistence is not eligible for ranking for this zone.', 'الاستمرارية غير مؤهلة للترتيب لهذه المنطقة.'));
      await expect(row).toContainText(cause);
      const claim = L('not persistent', 'لم يكن الإجهاد مستمرًا');
      await expect(row).not.toContainText(claim);
      await expect(page.getByText(L('The stress was not persistent', 'لم يكن الإجهاد مستمرًا'))).toHaveCount(0);
      await expect(row).not.toContainText('UNRANKED');
      await expect(row.getByTestId('unranked-chip')).toBeVisible();
      await expect(row.getByTestId('evidence-quality-badge')).toHaveAttribute('data-class', 'none');
      // Condition 5 (F1 gate, fable51): every scored render keeps the ordering-only banner and
      // the decision-support guardrail; an UNRANKED zone never gains an implied class.
      await expect(page.getByTestId('priority-class-banner')).toContainText('aq-scorecard-1');
      await expect(page.getByTestId('priority-class-banner')).toContainText(L('Priority class not established', 'فئة الأولوية غير محددة'));
      await expect(page.getByTestId('zone-guardrail')).toHaveText(L(
        'Decision support for field verification — not enforcement, not a confirmed diagnosis.',
        'دعم قرار للتحقق الميداني — ليس إنفاذًا ولا تشخيصًا مؤكدًا.'));
      // The UNRANKED group heading is part of the scored render too: it must state the
      // eligibility gate and never resurrect the pre-F1 non-persistence claim.
      // `> h5` so the assertion lands on the group heading, not on the h5 headings nested inside
      // the rows it contains.
      const heading = page.locator('[data-testid="unranked-group"][data-reason="PERSISTENCE_INELIGIBLE"] > h5');
      // The zone panel is the only surface that renders an `unranked-group` block (the decision
      // card lists the same zones without a group heading), so the heading is unique on the page.
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText(L('Persistence not eligible for ranking (1)', 'الاستمرارية غير مؤهلة للترتيب (1)'));
      await expect(heading).not.toContainText(L('not persistent', 'غير مستمر'));
      expect(await heading.textContent()).not.toMatch(/not persistent|غير مستمر/i);
      await expect(page.locator('[data-testid="unranked-group"]')).toHaveCount(1);
      expect(await page.locator('.result-panel').innerText()).not.toMatch(/stress not persistent|الإجهاد غير مستمر|لم يكن الإجهاد مستمرًا/i);
    });
  }

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

    // DR-M3-01 §8: the card projects the committed identity, the committed versions, the AOI with
    // its inset, sources with product/version/revision and dates, ranked zones with their rank-key
    // components and independent families, the unranked zones grouped by reason, the
    // class/limitations statements — and states explicitly which field the result does not carry.
    test('card projects identity, AOI, sources and per-zone detail without dropping a field', async ({page}) => {
      const {body} = await servedSha(page, M3_SCORED_ID);
      const request = body.request as {aoi_geojson: {coordinates: number[][][]}};
      const m2 = body.m2 as {
        pipeline_version: string;
        config_version: string;
        source_manifest: unknown[];
        observations: {observation_class: string}[];
      };
      // Expectations computed here from the served body, not read back off the page: the AOI hash
      // is re-derived independently with Node's crypto over the same canonical form.
      const aoiSha = createHash('sha256').update(canonicalJson(request.aoi_geojson), 'utf8').digest('hex');
      const outerRing = request.aoi_geojson.coordinates[0] as number[][];
      const observed = m2.observations.filter((row) => row.observation_class === 'OBSERVED').length;

      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?panel=card`);
      const card = page.getByTestId('decision-card');
      await expect(card).toBeVisible();

      // Identity: the committed pipeline/config versions the card must print.
      await expect(page.getByTestId('card-pipeline-version')).toHaveText(body.pipeline_version as string);
      await expect(page.getByTestId('card-m2-pipeline-version')).toHaveText(m2.pipeline_version);
      await expect(page.getByTestId('card-m2-config-version')).toHaveText(m2.config_version);

      // AOI identity: re-derived hash, committed vertex count and bounds; labelled as re-derived.
      await expect(page.getByTestId('card-aoi-hash')).toHaveText(aoiSha.slice(0, 12));
      await expect(page.getByTestId('card-aoi-vertices')).toHaveText(String(outerRing.length - 1));
      await expect(page.getByTestId('card-aoi-bounds')).toContainText('0.01');
      await expect(card).toContainText(L('re-derived in this browser', 'معاد اشتقاقها في هذا المتصفح'));

      // Inset: inline SVG drawn from the committed geometry — no basemap, no raster, no image.
      const inset = page.getByTestId('card-inset');
      await expect(inset.locator('svg')).toBeVisible();
      await expect(inset.locator('[data-testid="card-inset-aoi"]')).toHaveCount(1);
      await expect(inset.locator('path[data-zone-id="Z-1"]')).toHaveCount(1);
      expect(await inset.locator('image').count()).toBe(0);
      await expect(inset).toContainText(L('Not a basemap', 'وليس خلفية خرائط'));

      // Sources: localized role and status, product version/revision and dates; the entry that
      // carries no version/revision/dates says so instead of dropping the fields.
      const sources = card.locator('.card-source-list li');
      await expect(sources).toHaveCount(m2.source_manifest.length);
      // Dates are rendered through the app's single date policy (Gregorian, Latin digits), so the
      // expectation is computed with the same policy here instead of an ISO string.
      const sourceDate = new Intl.DateTimeFormat(`${locale}-u-ca-gregory-nu-latn`, {dateStyle: 'medium', timeZone: 'UTC'})
        .format(new Date('2026-08-30T00:00:00Z'));
      const opticalSource = sources.filter({hasText: 'sentinel2_l2a_earth_search'});
      await expect(opticalSource).toContainText(L('Temporal', 'زمني'));
      await expect(opticalSource).toContainText(L('Read', 'مقروء'));
      await expect(opticalSource).toContainText('sentinel-2-l2a');
      await expect(opticalSource).toContainText('05.11');
      await expect(opticalSource).toContainText(sourceDate);
      await expect(sources.filter({hasText: 'chirps'}))
        .toContainText(L('No product version, revision or dates', 'لا يوجد إصدار منتج أو مراجعة أو تواريخ'));

      // Observations: counts and recorded gaps.
      await expect(card).toContainText(`${observed} ${L('observed', 'مرصودة')}`);
      await expect(card).toContainText(L('Coverage gaps recorded', 'فجوات التغطية المسجلة'));

      // Ranked zone detail: rank key components, independent families, confounders, evidence refs.
      const z1 = card.locator('.card-zone[data-zone-id="Z-1"]');
      await expect(z1).toHaveAttribute('data-ranked', 'true');
      await expect(z1.getByTestId('card-zone-rank-key')).toContainText('0.4210');
      const families = z1.getByTestId('card-zone-families');
      await expect(families).toContainText(L('Optical: counted', 'بصرية: محتسبة'));
      await expect(families).toContainText(L('Radar (SAR): not counted', 'رادار (SAR): غير محتسبة'));
      await expect(z1.getByTestId('card-zone-confounders').locator('[data-confounder="GROWTH_STAGE"]')).toBeVisible();
      const refs = z1.getByTestId('card-zone-evidence-refs');
      await expect(refs).toContainText('sentinel-2-l2a');
      await expect(refs).toContainText('05.11');

      // Unranked zones stay counted, grouped by reason and listed with their reasons.
      await expect(card).toContainText(L('Unranked zones', 'المناطق غير المرتبة'));
      await expect(card.locator('.card-zone[data-zone-id="Z-2"]')).toBeVisible();
      // Limitations: the standing set always prints, including the mask/validation statements.
      await expect(card).toContainText(L('Masked pixels are excluded', 'تُستبعد البكسلات المحجوبة'));
      await expect(card).toContainText(L('not validated against in-basin field measurements', 'مقابل قياسات ميدانية داخل الحوض'));
      await expect(card).toContainText(L('provisional', 'مؤقتة'));
      expect(await card.innerText()).not.toMatch(DENYLIST);
    });

    // Round-3 F-01 (stage-⑥ Council BLOCK at head 70e0abf, both seats): DR-M3-01 §8 requires
    // "valid-observation counts, coverage and gaps". The card must project the committed whole-area
    // valid count and effective coverage, the per-observation valid counts with their zone/window
    // scope, and each recorded gap with a localized reason — not only the observation-ROW totals.
    test('card and print project committed valid counts, coverage and scoped gap records', async ({page}) => {
      const {body} = await servedSha(page, M3_CARD_PROJECTION_ID);
      const m2 = body.m2 as {
        observations: {zone_id: string; indicator: string; observation_class: string; valid_count: number; valid_area_fraction?: number | null; window_start: string}[];
        coverage: {source_id: string; window_start: string; window_end: string; reason_code: string; expected_count: number; observed_count: number; coverage_fraction: number}[];
      };
      const statistics = body.statistics as {valid_observation_count: number; valid_area_m2: number};
      const effectiveCoverage = body.effective_coverage as {valid_coverage_fraction: number; acquisition_date: string};
      const gap = m2.coverage[0]!;
      const firstObservation = m2.observations[0]!;
      const rowCounts = m2.observations.reduce((tally, observation) => {
        tally[observation.observation_class] = (tally[observation.observation_class] ?? 0) + 1;
        return tally;
      }, {} as Record<string, number>);

      await page.goto(`/${locale}/analysis/${M3_CARD_PROJECTION_ID}?panel=card`);
      const card = page.getByTestId('decision-card');
      await expect(card).toBeVisible();

      // The committed whole-area valid count and area, and the effective coverage — from the served
      // body, not read back off the page.
      await expect(page.getByTestId('card-valid-observation-count')).toHaveText(formatValue(statistics.valid_observation_count, locale, 0));
      await expect(page.getByTestId('card-valid-area')).toHaveText(formatValue(statistics.valid_area_m2, locale, 0));
      await expect(page.getByTestId('card-effective-coverage')).toHaveText(formatValue(effectiveCoverage.valid_coverage_fraction, locale, 6));
      await expect(page.getByTestId('card-coverage-acquisition')).toContainText(formatGregorianDate(effectiveCoverage.acquisition_date, locale));

      // Observation-ROW totals stay distinct from the committed valid count.
      const rows = page.getByTestId('card-observation-rows');
      await expect(rows).toContainText(`${rowCounts.OBSERVED ?? 0} ${L('observed', 'مرصودة')}`);
      await expect(rows).toContainText(`${rowCounts.MISSING ?? 0} ${L('missing', 'مفقودة')}`);
      await expect(rows).not.toContainText(formatValue(statistics.valid_observation_count, locale, 0));

      // Per-observation valid counts, with their own zone/window scope.
      const firstRow = card.locator(`[data-observation-zone="${firstObservation.zone_id}"]`).first();
      await expect(firstRow).toContainText(formatValue(firstObservation.valid_count, locale, 0));
      await expect(firstRow).toContainText(formatGregorianDate(firstObservation.window_start, locale));
      if (typeof firstObservation.valid_area_fraction === 'number') {
        await expect(firstRow).toContainText(formatPercent(firstObservation.valid_area_fraction, locale));
      }

      // The recorded gap: source, window, localized reason and counts — never just the number of gaps.
      await expect(page.getByTestId('card-coverage-gaps')).toContainText(L('Coverage gaps recorded', 'فجوات التغطية المسجلة'));
      const gapItem = card.locator(`[data-gap-source="${gap.source_id}"]`);
      await expect(gapItem).toBeVisible();
      await expect(gapItem).toContainText(formatGregorianDate(gap.window_start, locale));
      await expect(gapItem).toContainText(L('The source could not be read', 'تعذّرت قراءة المصدر'));
      await expect(gapItem).toContainText(gap.reason_code);
      await expect(gapItem).toContainText(formatValue(gap.observed_count, locale, 0));
      await expect(gapItem).toContainText(formatValue(gap.expected_count, locale, 0));
      await expect(gapItem).toContainText(formatValue(gap.coverage_fraction, locale, 6));

      // The print view is the same real-text layer, so the projection survives printing.
      await page.emulateMedia({media: 'print'});
      await expect(card).toBeVisible();
      await expect(gapItem).toBeVisible();
      await expect(page.getByTestId('card-valid-observation-count')).toHaveText(formatValue(statistics.valid_observation_count, locale, 0));
    });

    // Round-3 F-03 (stage-⑥ Council BLOCK, seat 2): DR-M3-01 §8 names the acquisition AND the
    // represented date as distinct content. The card must label the two roles separately instead of
    // merging them into one unlabeled list (which cannot tell two dates apart, nor say which role a
    // single date has). The main fixture carries equal dates, so this test uses the double whose
    // two dates are distinct.
    test('card labels represented and acquisition dates separately', async ({page}) => {
      const {body} = await servedSha(page, M3_CARD_PROJECTION_ID);
      const manifest = (body.m2 as {source_manifest: {source_id: string; represented_date?: string | null; acquisition_date?: string | null}[]}).source_manifest;
      const optical = manifest.find((source) => source.source_id === 'sentinel2_l2a_earth_search')!;
      expect(optical.represented_date).toBeTruthy();
      expect(optical.acquisition_date).toBeTruthy();
      expect(optical.represented_date).not.toBe(optical.acquisition_date);
      const representedText = formatGregorianDate(optical.represented_date as string, locale);
      const acquisitionText = formatGregorianDate(optical.acquisition_date as string, locale);

      await page.goto(`/${locale}/analysis/${M3_CARD_PROJECTION_ID}?panel=card`);
      const source = page.locator('.decision-card .card-source-list li[data-source-id="sentinel2_l2a_earth_search"]');
      const represented = source.locator('[data-source-date-role="represented"]');
      const acquisition = source.locator('[data-source-date-role="acquisition"]');
      await expect(represented).toContainText(L('Represented date', 'تاريخ التمثيل'));
      await expect(acquisition).toContainText(L('Acquisition date', 'تاريخ الالتقاط'));
      await expect(represented).toContainText(representedText);
      await expect(acquisition).toContainText(acquisitionText);
      // Each date sits under its own role, so neither role carries the other's date.
      await expect(represented).not.toContainText(acquisitionText);
      await expect(acquisition).not.toContainText(representedText);

      // A source with neither date states the absence explicitly rather than dropping the roles.
      const chirps = page.locator('.decision-card .card-source-list li[data-source-id="chirps"]');
      await expect(chirps).toContainText(L('No product version, revision or dates', 'لا يوجد إصدار منتج أو مراجعة أو تواريخ'));
    });

    // Round-3 F-01, absent/null ≠ zero: a result with no optional `m2` block must say "not returned",
    // never tally the missing rows into 0 observed / 0 derived / 0 missing.
    test('an absent M2 block is reported as not returned, never as a zero count', async ({page}) => {
      const {body} = await servedSha(page, M3_SCORED_ID);
      const statistics = body.statistics as {valid_observation_count: number};
      await serveMutated(page, M3_SCORED_ID, (mutated) => { delete mutated.m2; });
      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?panel=card`);
      const rows = page.getByTestId('card-observation-rows');
      await expect(rows).toHaveText(L('Not returned', 'لم يُعَد'));
      await expect(rows).not.toContainText('0');
      // The committed whole-area count does not depend on the absent M2 block and still projects.
      await expect(page.getByTestId('card-valid-observation-count')).toHaveText(formatValue(statistics.valid_observation_count, locale, 0));
      await expect(page.getByTestId('card-coverage-gaps')).toContainText(L('not returned', 'لم تُعَد'));
      await expect(page.getByTestId('card-observations-unavailable')).toContainText(L('not returned', 'لم تُعَد'));
    });

    // Round-5 C-01 (Council BLOCK at ac59b67, both seats): `m2.observations` and `m2.coverage` are
    // OPTIONAL members of an otherwise present M2 block. Absence (no key) means "not collected" and
    // must read "not returned" on the card AND in print — never a zero tally. An explicitly empty
    // array is the backend's committed "no rows / no gaps" statement, for which the zeros are
    // truthful and stay. Each member is omitted independently, then both together.
    for (const [label, mutate] of [
      ['observations omitted', (body: Record<string, unknown>) => { delete (body.m2 as Record<string, unknown>).observations; }],
      ['coverage omitted', (body: Record<string, unknown>) => { delete (body.m2 as Record<string, unknown>).coverage; }],
      ['both omitted', (body: Record<string, unknown>) => {
        const m2 = body.m2 as Record<string, unknown>;
        delete m2.observations;
        delete m2.coverage;
      }]
    ] as const) {
      test(`an absent M2 member array is not returned, never a zero count (${label})`, async ({page}) => {
        await serveMutated(page, M3_CARD_PROJECTION_ID, mutate);
        await page.goto(`/${locale}/analysis/${M3_CARD_PROJECTION_ID}?panel=card`);
        await expect(page.getByTestId('decision-card')).toBeVisible();
        const rows = page.getByTestId('card-observation-rows');
        const gaps = page.getByTestId('card-coverage-gaps');
        if (label !== 'coverage omitted') {
          await expect(rows).toHaveText(L('Not returned', 'لم يُعَد'));
          await expect(rows).not.toContainText('0');
          await expect(page.getByTestId('card-observation-rows-not-returned')).toContainText(L('not returned', 'لم تُعَد'));
        } else {
          await expect(rows).toContainText(L('observed', 'مرصودة'));
        }
        if (label !== 'observations omitted') {
          await expect(gaps).toHaveText(L('Coverage gaps recorded: not returned — the result carries no gap list.', 'فجوات التغطية المسجلة: لم تُعَد — لا تحمل هذه النتيجة قائمة فجوات.'));
        } else {
          await expect(gaps).toContainText(L('Coverage gaps recorded: 1', 'فجوات التغطية المسجلة: 1'));
        }
        // The same distinction on the print surface (the card IS the print view; the repeated
        // header/footer bands must not change the projection).
        await page.emulateMedia({media: 'print'});
        if (label !== 'coverage omitted') {
          await expect(rows).toHaveText(L('Not returned', 'لم يُعَد'));
          await expect(page.getByTestId('card-observation-rows-not-returned')).toBeVisible();
        }
        if (label !== 'observations omitted') {
          await expect(gaps).toHaveText(L('Coverage gaps recorded: not returned — the result carries no gap list.', 'فجوات التغطية المسجلة: لم تُعَد — لا تحمل هذه النتيجة قائمة فجوات.'));
        }
      });
    }

    // Round-5 C-01 counterpart: explicitly EMPTY member arrays are the committed statement
    // "no rows / no gaps" — the zeros are truthful there and must not be rewritten into
    // "not returned" (no over-correction from the absent-member fix).
    test('explicitly empty M2 member arrays keep their truthful zeros', async ({page}) => {
      await serveMutated(page, M3_CARD_PROJECTION_ID, (mutated) => {
        const m2 = mutated.m2 as Record<string, unknown>;
        m2.observations = [];
        m2.coverage = [];
      });
      await page.goto(`/${locale}/analysis/${M3_CARD_PROJECTION_ID}?panel=card`);
      await expect(page.getByTestId('card-observation-rows')).toHaveText(L('0 observed · 0 derived · 0 missing', '0 مرصودة · 0 مشتقة · 0 مفقودة'));
      await expect(page.getByTestId('card-observation-rows-none')).toBeVisible();
      await expect(page.getByTestId('card-coverage-gaps')).toHaveText(L('Coverage gaps recorded: 0', 'فجوات التغطية المسجلة: 0'));
      // The absent-member wording is not shown: the arrays are present, only empty.
      await expect(page.getByTestId('card-observation-rows-not-returned')).toHaveCount(0);
      await page.emulateMedia({media: 'print'});
      await expect(page.getByTestId('card-observation-rows')).toHaveText(L('0 observed · 0 derived · 0 missing', '0 مرصودة · 0 مشتقة · 0 مفقودة'));
      await expect(page.getByTestId('card-coverage-gaps')).toHaveText(L('Coverage gaps recorded: 0', 'فجوات التغطية المسجلة: 0'));
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

    // Round-5 C-02 (Council BLOCK at ac59b67, seat 1): the repeated header/footer paint at the
    // top/bottom of EVERY page box (`position: fixed`), so the printed page margins must reserve a
    // band for them on every page. This regression generates real multipage PDFs in both locales;
    // the full text-box overlap receipt is independently re-verified with PyMuPDF in the gate run.
    test('printed multipage card keeps repeated bands and real text in both locales', async ({page}) => {
      test.setTimeout(120_000);
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
      const pdf = await page.pdf({format: 'A4', printBackground: true});
      const pageCount = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
      expect(pageCount, `${locale}: expected a multipage decision-card PDF`).toBeGreaterThanOrEqual(2);
      expect(pdf.byteLength).toBeGreaterThan(2000);
      await expect(page.getByRole('heading', {name: L('Ranked zones', 'المناطق المرتبة')}).last()).toBeVisible();
      await expect(page.getByTestId('decision-card')).toContainText('Z-1');
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
      const omittedCountsRow = drawer.locator(`[data-analysis-id="${M3_SLOW_ID}"]`);
      await expect(omittedCountsRow).not.toContainText(L('0 ranked · 0 unranked', '0 مرتبة · 0 غير مرتبة'));
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
