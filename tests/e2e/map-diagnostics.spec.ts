import {expect, test, type Page} from '@playwright/test';
import {mapErrorCategory} from '../../src/lib/map-diagnostics';

test('map diagnostics classify errors without returning private exception fields', () => {
  const error = new TypeError('https://private.invalid/?token=synthetic-private-value');
  expect(mapErrorCategory(error)).toBe('type-error');
  error.name = 'synthetic-private-value';
  expect(mapErrorCategory(error)).toBe('other-error');
  expect(mapErrorCategory({message: 'synthetic-private-value', url: 'https://private.invalid'})).toBe('other-error');
  expect(mapErrorCategory(new DOMException('synthetic-private-value', 'SecurityError'))).toBe('security-error');
});

function captureMapReports(page: Page) {
  const reports: Promise<unknown[]>[] = [];
  page.on('console', (message) => {
    if (message.text().startsWith('[AquaLedger map]')) {
      reports.push(Promise.all(message.args().map((argument) => argument.jsonValue())));
    }
  });
  return () => Promise.all(reports);
}

async function expectInitializationFailure(page: Page) {
  await expect(page.getByText('The map or polygon drawing control could not be loaded. Area drawing is unavailable.')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Draw polygon', exact: true})).toBeDisabled();
}

test('failed browser module download reports the module-import boundary', async ({page}) => {
  const reports = captureMapReports(page);
  let failedMapChunks = 0;
  await page.route('**/_next/static/chunks/*.js', async (route) => {
    const response = await route.fetch();
    // Identify the pinned library by its canvas-container marker, without a build-specific hash.
    if ((await response.text()).includes('maplibregl-canvas-container')) {
      failedMapChunks += 1;
      await route.abort('failed');
    } else {
      await route.fulfill({response});
    }
  });
  await page.goto('/en/analysis');
  await expectInitializationFailure(page);
  expect(failedMapChunks).toBeGreaterThan(0);
  expect(await reports()).toEqual([['[AquaLedger map]', {stage: 'module-import', category: 'other-error'}]]);
  expect(await page.evaluate(() => Boolean((window as unknown as {__AQUALEDGER_TEST_MAP__?: unknown}).__AQUALEDGER_TEST_MAP__))).toBe(false);
});

test('map construction failure reports its boundary without exception text', async ({page}) => {
  const reports = captureMapReports(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, contextType: string, ...args: unknown[]) {
        if (contextType === 'webgl2') throw new TypeError('synthetic-private-construction-value');
        return Reflect.apply(original, this, [contextType, ...args]);
      }
    });
  });
  await page.goto('/en/analysis');
  await expectInitializationFailure(page);
  expect(await reports()).toEqual([['[AquaLedger map]', {stage: 'map-construction', category: 'type-error'}]]);
});

test('drawing-ready synchronization failure reports its boundary', async ({page}) => {
  const reports = captureMapReports(page);
  await page.addInitScript(() => {
    let instance: import('maplibre-gl').Map | undefined;
    Object.defineProperty(window, '__AQUALEDGER_TEST_MAP__', {
      configurable: true,
      get: () => instance,
      set: (map: import('maplibre-gl').Map) => {
        instance = map;
        const disable = map.doubleClickZoom.disable.bind(map.doubleClickZoom);
        // Switching to Terra Draw's render mode disables double-click zoom in the ready callback.
        map.doubleClickZoom.disable = () => {
          map.doubleClickZoom.disable = disable;
          throw new TypeError('synthetic-private-drawing-value');
        };
      }
    });
  });
  await page.goto('/en/analysis');
  await expectInitializationFailure(page);
  expect(await reports()).toEqual([['[AquaLedger map]', {stage: 'drawing-sync', category: 'type-error'}]]);
  expect(await page.evaluate(() => Boolean((window as unknown as {__AQUALEDGER_TEST_MAP__?: unknown}).__AQUALEDGER_TEST_MAP__))).toBe(true);
});

for (const locale of ['en', 'ar'] as const) {
  test(`map failures retain localized UI and emit one bounded report in ${locale}`, async ({page}) => {
    const reports = captureMapReports(page);
    await page.goto(`/${locale}/analysis`);
    const drawButton = page.getByRole('button', {name: locale === 'en' ? 'Draw polygon' : 'ارسم مضلعاً', exact: true});
    await expect(drawButton).toBeEnabled({timeout: 45_000});
    expect(await reports()).toEqual([]);
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
    const diagnostics = await reports();
    expect(diagnostics).toEqual([['[AquaLedger map]', {stage: 'map-runtime', category: 'type-error'}]]);
    expect(JSON.stringify(diagnostics)).not.toContain('synthetic-private-value');
    expect(JSON.stringify(diagnostics)).not.toContain('private.invalid');
  });
}
