import {expect, test} from '@playwright/test';
import {PREVIEW_READY_ID} from '../fixtures/backend-double';

for (const locale of ['en', 'ar'] as const) {
  test(`compact reference dashboard preserves empty and saved structures in ${locale}`, async ({page}) => {
    for (const suffix of ['', `/${PREVIEW_READY_ID}`]) {
      await page.goto(`/${locale}/analysis${suffix}`);
      await expect(page.locator('.metric-card')).toHaveCount(4);
      await expect(page.locator('.trend-card')).toBeVisible();
      await expect(page.locator('.decision-support-card')).toBeVisible();
      await expect(page.locator('.page-intro, .workspace-page .page-heading, .result-empty-state')).toHaveCount(0);
      await expect(page.locator('.input-panel .eyebrow, .map-panel .eyebrow, .results-heading .eyebrow')).toHaveCount(0);
      expect(await page.locator('body').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
      await expect(page.locator('.metric-card').nth(1)).toContainText(locale === 'en' ? 'AOI area not returned' : 'لم تُعَد مساحة المنطقة');
      await expect(page.locator('.ndvi-series')).toHaveCount(0);
      if (suffix) {
        await expect(page.locator('.metric-card').first()).toContainText('0.42');
        await expect(page.locator('.map-provenance')).toContainText('2026-08-30');
        const ndvi = page.locator('.layer-controls input').first();
        await expect(ndvi).toBeEnabled();
        await expect(page.locator('.map-ndvi-legend')).toBeVisible({timeout: 45_000});
        await ndvi.uncheck();
        await expect(page.locator('.map-ndvi-legend')).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => (window as unknown as {__AQUALEDGER_TEST_MAP__: {getLayoutProperty: (id: string, property: string) => unknown}}).__AQUALEDGER_TEST_MAP__.getLayoutProperty('ndvi-preview-layer', 'visibility'))).toBe('none');
      } else {
        await expect(page.locator('.metric-card').first()).toContainText(locale === 'en' ? 'Unavailable' : 'غير متاح');
        await expect(page.locator('.map-provenance, .map-ndvi-legend')).toHaveCount(0);
      }
    }
  });

  test(`matched desktop geometry at both evidence sizes in ${locale}`, async ({page}) => {
    for (const viewport of [{width: 1091, height: 690}, {width: 1440, height: 900}]) {
      await page.setViewportSize(viewport);
      for (const suffix of ['', `/${PREVIEW_READY_ID}`]) {
      await page.goto(`/${locale}/analysis${suffix}`);
      await expect(page.locator('.metric-card').first()).toContainText(suffix ? '0.42' : (locale === 'en' ? 'Unavailable' : 'غير متاح'));
      const header = await page.locator('.site-header').boundingBox();
      const rail = await page.locator('.input-panel').boundingBox();
      const map = await page.locator('.map-frame').boundingBox();
      const cta = await page.locator('.run-button').boundingBox();
      expect(header!.height).toBe(52);
      expect(rail!.width).toBe(200);
      expect(map!.width / viewport.width).toBeGreaterThan(.37);
      expect(map!.width / viewport.width).toBeLessThan(.47);
      const results = await page.locator('.result-panel').boundingBox();
      expect(results!.width / viewport.width).toBeCloseTo(.39, 2);
      const card = await page.locator('.metric-card').first().boundingBox();
      expect(card!.width).toBeGreaterThanOrEqual(195);
      const decision = await page.locator('.decision-support-card').boundingBox();
      expect(decision!.y + decision!.height).toBeLessThan(viewport.height);
      expect(await page.locator('.result-details-heading').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(viewport.height);
      expect(cta!.y + cta!.height).toBeLessThanOrEqual(viewport.height);
      expect(await page.locator('.metric-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
      await expect(page.locator('.header-search input')).toBeDisabled();
      await expect(page.locator('.shape-tools button').nth(1)).toBeDisabled();
      await expect(page.locator('.shape-tools button').nth(2)).toBeDisabled();
      }
    }
  });
}
