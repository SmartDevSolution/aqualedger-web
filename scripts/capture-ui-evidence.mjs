// Browser-test evidence only. No production fixtures or services are changed.
// Starts isolated local Next.js + the existing labelled backend double.
import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const root = new URL('../', import.meta.url).pathname;
const output = `${root}docs/ui-evidence/issue-27/rework`;
await mkdir(output, {recursive: true});
const backend = spawn(process.execPath, ['tests/fixtures/run-backend-double.mjs'], {cwd: root, env: {...process.env, BACKEND_DOUBLE_PORT: '43128'}, stdio: 'ignore'});
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '43127'], {cwd: root, env: {...process.env, AQUALEDGER_API_BASE_URL: 'http://127.0.0.1:43128', AQUALEDGER_OPERATOR_JWT: 'e2e-relay-test-operator-token-not-a-secret'}, stdio: 'inherit'});
const origin = 'http://127.0.0.1:43127';
let browser;
try {
  const deadline = Date.now() + 60000;
  while (true) {
    try { if ((await fetch(`${origin}/en/analysis`)).ok) break; } catch { /* The local server is still starting. */ }
    if (Date.now() > deadline) throw new Error('Evidence server readiness timed out');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({headless: true});
  const measurements = [];
  for (const locale of ['en', 'ar']) {
    for (const viewport of [{width: 1091, height: 690}, {width: 1440, height: 900}, {width: 390, height: 844}]) {
      for (const state of ['populated', 'empty']) {
        // Capture both states at every exact acceptance viewport.
        const context = await browser.newContext({viewport, isMobile: viewport.width === 390, hasTouch: viewport.width === 390});
        const page = await context.newPage();
        // A clearly labelled screenshot-only fixture: existing saved-result payload and TIFF,
        // positioned over Yemen for a same-region comparison. Not genuine EO observations.
        // No statistics, count, date, series or source metadata are invented here.
        if (state === 'populated') await page.route('**/api/analyses/44444444-4444-4444-8444-444444444444/result', async route => {
          const response = await route.fetch();
          const data = await response.json();
          for (const artifact of data.artifacts ?? []) if (artifact.kind === 'ndvi_preview') {
            artifact.bounds = {minx: 452000, miny: 1420000, maxx: 495000, maxy: 1480000};
            artifact.crs = 'EPSG:32638';
          }
          await route.fulfill({response, json: data});
        });
        await page.goto(`${origin}/${locale}/analysis${state === 'populated' ? '/44444444-4444-4444-8444-444444444444' : ''}`);
        await page.locator('.metric-grid').waitFor();
        if (state === 'populated') await page.locator('.map-ndvi-legend').waitFor({timeout: 45000});
        await page.waitForTimeout(2000);
        await page.evaluate(() => new Promise(resolve => {const map = globalThis.__AQUALEDGER_TEST_MAP__; if (!map) return resolve(); map.once('render', resolve); map.triggerRepaint();}));
        await page.evaluate(() => globalThis.scrollTo(0, 0));
        const name = `${locale}-${state}-browser-fixture-${viewport.width}x${viewport.height}`;
        await page.screenshot({path: `${output}/${name}.png`});
        if (viewport.width === 390) await page.screenshot({path: `${output}/${name}-full.png`, fullPage: true});
        measurements.push({name, viewport, fixture: state === 'populated' ? 'Existing PREVIEW_READY saved-route fixture; screenshot-only Yemen artifact positioning, not real EO' : 'Empty workspace', geometry: await page.evaluate(() => {
          const bounds = selector => globalThis.document.querySelector(selector)?.getBoundingClientRect().toJSON();
          const columns = [...globalThis.document.querySelector('.workspace-grid').children].map(child => ({class: child.className, bounds: child.getBoundingClientRect().toJSON(), widthPercent: child.getBoundingClientRect().width / globalThis.innerWidth * 100}));
          return {columns, map: bounds('.map-frame'), rail: bounds('.result-panel'), card: bounds('.metric-card'), decision: bounds('.decision-support-card'), horizontalOverflow: globalThis.document.documentElement.scrollWidth > globalThis.innerWidth};
        }), map: await page.evaluate(() => { const map = globalThis.__AQUALEDGER_TEST_MAP__; return map ? {bounds: map.getBounds().toArray(), zoom: map.getZoom()} : null; })});
        await context.close();
      }
    }
  }
  await writeFile(`${output}/capture-measurements.json`, JSON.stringify(measurements, null, 2));
  console.log(`Captured ${measurements.length} states with four additional full-page mobile captures in ${output}`);
} finally {
  await browser?.close();
  app.kill(); backend.kill();
}
