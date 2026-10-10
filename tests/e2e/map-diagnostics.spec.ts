import {expect, test} from '@playwright/test';
import {mapErrorCategory} from '../../src/lib/map-diagnostics';

test('map diagnostics classify errors without returning private exception fields', () => {
  const error = new TypeError('https://private.invalid/?token=synthetic-private-value');
  expect(mapErrorCategory(error)).toBe('type-error');
  error.name = 'synthetic-private-value';
  expect(mapErrorCategory(error)).toBe('other-error');
  expect(mapErrorCategory({message: 'synthetic-private-value', url: 'https://private.invalid'})).toBe('other-error');
  expect(mapErrorCategory(new DOMException('synthetic-private-value', 'SecurityError'))).toBe('security-error');
});

for (const locale of ['en', 'ar'] as const) {
  test(`map failures retain localized UI and emit one bounded report in ${locale}`, async ({page}) => {
    const reports: Promise<unknown[]>[] = [];
    page.on('console', (message) => {
      if (message.text().startsWith('[AquaLedger map]')) {
        reports.push(Promise.all(message.args().map((argument) => argument.jsonValue())));
      }
    });
    await page.goto(`/${locale}/analysis`);
    const drawButton = page.getByRole('button', {name: locale === 'en' ? 'Draw polygon' : 'ارسم مضلعاً', exact: true});
    await expect(drawButton).toBeEnabled({timeout: 45_000});
    expect(reports).toEqual([]);
    await page.evaluate(() => {
      const map = (window as unknown as {__AQUALEDGER_TEST_MAP__: import('maplibre-gl').Map}).__AQUALEDGER_TEST_MAP__;
      const error = new TypeError('https://private.invalid/?token=synthetic-private-value');
      map.fire('error', {error});
      map.fire('error', {error});
    });
    await expect(drawButton).toBeDisabled();
    await expect(page.getByText(locale === 'en'
      ? 'The map or polygon drawing control could not be loaded. Area drawing is unavailable.'
      : 'تعذر تحميل الخريطة أو أداة رسم المضلع. لا يمكن رسم المنطقة.')).toBeVisible();
    const diagnostics = await Promise.all(reports);
    expect(diagnostics).toEqual([['[AquaLedger map]', {stage: 'map-runtime', category: 'type-error'}]]);
    expect(JSON.stringify(diagnostics)).not.toContain('synthetic-private-value');
    expect(JSON.stringify(diagnostics)).not.toContain('private.invalid');
  });
}
