import {expect, test} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';
import {M3_SCORED_ID, PREVIEW_READY_ID} from '../fixtures/backend-double';
import en from '../../messages/en.json';
import ar from '../../messages/ar.json';

// Measurements use a labelled backend fixture. White is the brightest possible
// satellite pixel: alpha-compositing over it gives the conservative contrast bound.
for (const locale of ['en', 'ar'] as const) {
  test(`review corrections measured in ${locale}`, async ({page}, testInfo) => {
    await page.goto(`/${locale}/analysis/${PREVIEW_READY_ID}`);
    await expect(page.locator('.result-statistics')).toBeVisible();
    await expect(page.getByRole('button', {name: locale === 'en' ? 'Draw polygon' : 'ارسم مضلع'})).toBeEnabled({timeout: 45_000});
    const date = page.locator('.result-facts').first().locator('.result-fact').nth(2).locator('bdi');
    const dateMeasurement = await date.evaluate(element => {
      const text = element.firstChild!;
      const words = element.textContent!.match(/[\p{L}\p{N}]+/gu)!;
      let offset = 0;
      const positions = words.map(word => {
        const start = element.textContent!.indexOf(word, offset);
        offset = start + word.length;
        const range = document.createRange();
        range.setStart(text, start); range.setEnd(text, offset);
        return {word, x: range.getBoundingClientRect().x};
      });
      return {text: element.textContent, dir: element.getAttribute('dir'), direction: getComputedStyle(element).direction, positions};
    });
    const disclosuresBefore = await page.locator('details:not(.maplibregl-ctrl-attrib) > summary').evaluateAll(elements => elements.map(element => ({text: element.textContent, expanded: element.getAttribute('aria-expanded'), controls: element.getAttribute('aria-controls')})));
    const phase = process.env.CORRECTION_BASELINE ? 'before' : 'after';
    const size = testInfo.project.name.includes('small') ? 'mobile' : 'desktop';
    const directory = 'docs/ui-evidence/issue-27/corrections';
    mkdirSync(directory, {recursive: true});
    await date.locator('..').screenshot({path: `${directory}/${phase}-${locale}-${size}-date.png`});
    const canvas = page.locator('.maplibregl-canvas');
    await canvas.scrollIntoViewIfNeeded();
    await page.locator('.map-canvas-wrap').screenshot({path: `${directory}/${phase}-${locale}-${size}-map.png`});
    // Screenshot auto-scrolling can leave an absolute canvas outside the touch viewport.
    // Center the actual map frame again before dispatching the real single-finger gesture.
    await page.locator('.map-frame').evaluate(element => element.scrollIntoView({block: 'center'}));
    await page.waitForTimeout(150);
    const box = (await canvas.boundingBox())!;
    const touchSession = testInfo.project.name.includes('small') ? await page.context().newCDPSession(page) : null;
    if (touchSession) {
      const session = touchSession;
      await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: box.x + box.width / 2, y: box.y + 100}]});
      // Use consecutive movement frames, as a human drag does. One coalesced move
      // can become a document scroll before MapLibre observes its first touchmove.
      await page.waitForTimeout(80);
      await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: box.x + box.width / 2, y: box.y + 120}]});
      await page.waitForTimeout(80);
      await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: box.x + box.width / 2, y: box.y + 150}]});
      await expect(page.locator('.maplibregl-cooperative-gesture-screen')).toHaveClass(/maplibregl-show/);
      // Hold the touch through the visibility/contrast measurement: MapLibre hides
      // the mobile-only hint on touchEnd, unlike the desktop wheel hint timer.
    } else {
      await page.mouse.move(box.x + box.width / 2, box.y + 100);
      await page.mouse.wheel(0, 100);
    }
    const hint = page.locator('.maplibregl-cooperative-gesture-screen');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveClass(/maplibregl-show/);
    const copy = locale === 'ar' ? ar.workspace : en.workspace;
    await expect(hint.getByText(size === 'mobile' ? copy.mapGestureHintMobile : copy.mapGestureHintWindows, {exact: true})).toBeVisible();
    const contrast = await page.locator('.maplibregl-ctrl-attrib, .maplibregl-cooperative-gesture-screen').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
      const background = rgb(style.backgroundColor);
      const alpha = background[3] ?? 1;
      const effective = background.slice(0, 3).map(channel => channel * alpha + 255 * (1 - alpha));
      const luminance = (channels: number[]) => channels.slice(0, 3).map(channel => {const v = channel / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;}).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0);
      const ratio = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
      return {className: element.className, text: element.textContent, color: style.color, background: style.backgroundColor, effectiveBackgroundOverWhite: effective, contrast: ratio(rgb(style.color), effective), links: Array.from(element.querySelectorAll('a')).map(a => ({text: a.textContent, contrast: ratio(rgb(getComputedStyle(a).color), effective)}))};
    }));
    await page.screenshot({path: `${directory}/${phase}-${locale}-${size}-overlays.png`, fullPage: true});
    writeFileSync(`${directory}/${phase}-${locale}-${size}.json`, JSON.stringify({fixture: PREVIEW_READY_ID, date: dateMeasurement, contrast, disclosures: disclosuresBefore}, null, 2) + '\n');
    if (touchSession) await touchSession.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    if (process.env.CORRECTION_BASELINE) return;
    expect(dateMeasurement.dir).toBe('auto');
    expect(dateMeasurement.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
    const positions = dateMeasurement.positions;
    for (let index = 1; index < positions.length; index++) {
      expect(locale === 'ar' ? positions[index - 1]!.x > positions[index]!.x : positions[index - 1]!.x < positions[index]!.x).toBeTruthy();
    }
    for (const control of contrast) {
      expect(control.contrast).toBeGreaterThanOrEqual(4.5);
      for (const link of control.links) expect(link.contrast).toBeGreaterThanOrEqual(4.5);
    }
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Esri');
    for (const summary of await page.locator('details:not(.maplibregl-ctrl-attrib) > summary').all()) {
      await expect(summary).toHaveAttribute('aria-expanded', 'false');
      const id = await summary.getAttribute('aria-controls');
      expect(id).toBeTruthy();
      const content = page.locator(`[id="${id}"]`);
      await expect(content).toHaveCount(1);
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(summary).toHaveAttribute('aria-expanded', 'true');
      await expect(content).toBeVisible();
      await page.keyboard.press('Space');
      await expect(summary).toHaveAttribute('aria-expanded', 'false');
      await expect(content).not.toBeVisible();
    }
    // Repeated zone disclosures must have unique control targets too.
    await page.goto(`/${locale}/analysis/${M3_SCORED_ID}`);
    await expect(page.locator('.technical-view summary').first()).toBeVisible();
    const targets = new Set<string>();
    for (const summary of await page.locator('.technical-view summary').all()) {
      await expect(summary).toHaveAttribute('aria-expanded', 'false');
      const id = (await summary.getAttribute('aria-controls'))!;
      expect(id).toBeTruthy();
      expect(targets.has(id)).toBeFalsy();
      targets.add(id);
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(summary).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator(`[id="${id}"]`)).toBeVisible();
      await page.keyboard.press('Space');
      await expect(summary).toHaveAttribute('aria-expanded', 'false');
    }
  });
}
