import {expect, test} from '@playwright/test';
import {M3_SCORED_ID} from '../fixtures/backend-double';

for (const locale of ['en', 'ar'] as const) {
  test(`idle AOI is quiet but invalid polygon action reports localized validation in ${locale}`, async ({page}) => {
    await page.goto(`/${locale}/analysis`);
    await expect(page.locator('.metric-grid')).toBeVisible();
    await expect(page.locator('.validation-message')).toHaveCount(0);
    await page.locator('.coordinate-entry summary').click();
    await page.locator('#aoi-geojson').fill(JSON.stringify({type: 'Polygon', coordinates: [[[44, 13], [44.01, 13], [44.01, 13.01], [44, 13.01]]]}));
    await page.getByRole('button', {name: locale === 'en' ? 'Use polygon' : 'استخدم المضلع'}).click();
    await expect(page.locator('.validation-message')).toHaveText(locale === 'en' ? 'The polygon must be closed, have positive area, and not cross itself.' : 'يجب إغلاق المضلع وأن تكون مساحته موجبة وألا يتقاطع مع نفسه.');
  });

  test(`dated observed trend uses actual calendar spacing and distinguishes empty dates in ${locale}`, async ({page}) => {
    await page.route(`**/api/analyses/${M3_SCORED_ID}/result`, async route => {
      const response = await route.fetch();
      const data = await response.json();
      const observed = data.m2.observations.find((o: {indicator: string; observation_class: string}) => o.indicator === 'NDVI' && o.observation_class === 'OBSERVED');
      // Explicit test observations, never production data: unequal gaps of 2 and 18 days.
      data.m2.observations = [
        {...observed, window_start: '2026-08-01', window_end: '2026-08-01', value: .2},
        {...observed, window_start: '2026-08-03', window_end: '2026-08-03', value: .4},
        {...observed, window_start: '2026-08-21', window_end: '2026-08-21', value: .6},
        {...observed, zone_id: 'other-zone', window_start: '2026-08-05', value: .9},
        {...observed, observation_class: 'DERIVED', window_start: '2026-08-06', value: .8},
        {...observed, observation_class: 'MISSING', window_start: '2026-08-07', value: null}
      ];
      data.scenes_evaluated = [];
      await route.fulfill({response, json: data});
    });
    await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
    const plot = page.locator('.ndvi-series');
    await expect(plot).toBeVisible();
    await expect(plot.locator('circle')).toHaveCount(3);
    const positions = await plot.locator('circle').evaluateAll(elements => elements.map(el => ({x: Number(el.getAttribute('cx')), y: Number(el.getAttribute('cy'))})));
    expect(positions.map(p => p.x)).toEqual([24, 51.2, 296]);
    expect(positions.map(p => p.y)).toEqual([53.6, 44.2, 34.8]);
    await expect(plot.locator('circle title').nth(1)).toHaveText('2026-08-03: 0.4');
    await expect(page.locator('.metric-card').nth(2)).toContainText(locale === 'en' ? '0 evaluated dates' : 'لا توجد تواريخ مقيّمة');
    await expect(page.locator('.date-observations')).toHaveCount(0);
    expect(await page.locator('body').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const viewport of [{width: 1091, height: 690}, {width: 1440, height: 900}]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const decision = await page.locator('.decision-support-card').boundingBox();
      expect(decision!.y + decision!.height).toBeLessThan(viewport.height);
    }
  });
}
