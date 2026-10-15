import {expect, test} from '@playwright/test';
import {NO_ELIGIBLE_ACQUISITION_UNDEFINED_COVERAGE_ID, PREVIEW_READY_ID} from '../fixtures/backend-double';

// Visual evidence uses the labelled backend double, never production measurements.
for (const locale of ['en', 'ar'] as const) {
  test(`dark teal three-zone workspace, accessible disclosures and responsive order in ${locale}`, async ({page}, testInfo) => {
    await page.goto(`/${locale}/analysis/${PREVIEW_READY_ID}`);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('.result-statistics')).toBeVisible();
    await expect(page.getByRole('button', {name: locale === 'en' ? 'Draw polygon' : 'ارسم مضلع'})).toBeEnabled({timeout: 45_000});
    await expect(page.locator('.map-canvas-wrap')).toHaveAttribute('dir', 'ltr');
    const boxes = await Promise.all(['.input-panel', '.map-panel', '.result-panel'].map((selector) => page.locator(selector).boundingBox()));
    const [input, map, result] = boxes;
    if (!input || !map || !result) throw new Error('All three zones must have visible bounds.');
    if (page.viewportSize()!.width >= 1024) {
      // The approved map has an exact 8px top inset; the rail and results start at the header.
      expect(map.y - input.y).toBe(8);
      expect(map.y - result.y).toBe(8);
      expect(map.width).toBeGreaterThan(input.width);
      expect(result.width / page.viewportSize()!.width).toBeCloseTo(.39, 2);
      if (locale === 'en') {
        expect(input.x + input.width).toBeLessThan(map.x);
        expect(map.x + map.width).toBeLessThan(result.x);
      } else {
        expect(result.x + result.width).toBeLessThan(map.x);
        expect(map.x + map.width).toBeLessThan(input.x);
      }
    } else {
      expect(input.y + input.height).toBeLessThanOrEqual(map.y);
      expect(map.y + map.height).toBeLessThanOrEqual(result.y);
    }
    expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    const colors = await page.locator('.input-panel').evaluate((element) => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => {
        const channels = color.match(/\d+/g)!.slice(0, 3).map((channel) => {
          const value = Number(channel) / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
      };
      const bg = luminance(style.backgroundColor);
      return {background: style.backgroundColor, contrast: (luminance(style.color) + 0.05) / (bg + 0.05)};
    });
    expect(colors.background).toBe('rgb(13, 28, 43)');
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
    const provenance = page.locator('.result-disclosure').filter({has: page.locator('#result-provenance-heading')});
    const summary = provenance.locator('summary');
    await expect(provenance).not.toHaveAttribute('open', '');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(provenance).toHaveAttribute('open', '');
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await expect(provenance.getByText('Sentinel-2 item A')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(provenance).not.toHaveAttribute('open', '');
    await expect(page.getByRole('button', {name: /Upload|Share analysis|Generate report|Select region/i})).toHaveCount(0);
    await expect(page.locator('.result-panel')).not.toContainText(/Vegetation Health|Healthy|\+18%|12,450/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path: testInfo.outputPath(`${locale}-workspace.png`), fullPage: true});
    await testInfo.attach(`${locale} workspace (labelled fixture)`, {path: testInfo.outputPath(`${locale}-workspace.png`), contentType: 'image/png'});
  });

  test(`missing statistics and coverage remain unavailable without a fabricated trend in ${locale}`, async ({page}) => {
    await page.goto(`/${locale}/analysis/${NO_ELIGIBLE_ACQUISITION_UNDEFINED_COVERAGE_ID}`);
    await expect(page.getByText(locale === 'en' ? 'The result contains no AOI-level NDVI statistics.' : 'لا تتضمن النتيجة إحصاءات NDVI على مستوى منطقة الاهتمام.')).toBeVisible();
    await expect(page.locator('.result-statistics')).toHaveCount(0);
    await expect(page.locator('.evidence-chart-value').first()).toHaveText(locale === 'en' ? 'Not returned' : 'لم يُعَد');
    // The new mandatory trend card remains, but must contain an honest unavailable state, never a fabricated plot.
    await expect(page.locator('.result-panel').getByText(/Monthly|Healthy/i)).toHaveCount(0);
    await expect(page.locator('.trend-card svg.ndvi-series')).toHaveCount(0);
    await expect(page.locator('.trend-unavailable')).toContainText(locale === 'en' ? 'Not enough observations to plot a trend' : 'لا توجد رصدات كافية لرسم اتجاه');
  });
}
