import {createHash} from 'node:crypto';
import {test, expect} from '@playwright/test';
import {canonicalJson} from '../../src/lib/api/result-hash';
import {scenarioExportBytes} from '../../src/lib/api/scenario-export';
import type {ScenarioResponse} from '../../src/lib/api/scenario';
import {M3_SCORED_ID} from '../fixtures/backend-double';

const DENYLIST = /\b(250\.0000|540\.0000|600\.0000|60\.0000)\b/;

for (const locale of ['en', 'ar'] as const) {
  const L = (en: string, ar: string) => (locale === 'en' ? en : ar);

  test.describe(`scenario panel in ${locale}`, () => {
    test('shows withheld quantities, identities and stable association across locale switch', async ({page, request}) => {
      const api = await request.get(`/api/analyses/${M3_SCORED_ID}/scenario`);
      expect(api.ok()).toBeTruthy();
      const expected = (await api.json()) as ScenarioResponse;

      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?scenario=1`);
      const panel = page.getByTestId('scenario-panel');
      await expect(panel).toBeVisible();
      await expect(page.getByTestId('scenario-withheld-banner')).toContainText(
        L('Cannot be estimated from the available inputs', 'لا يمكن التقدير من المدخلات المتاحة')
      );
      await expect(page.getByTestId('scenario-analysis-id')).toHaveText(M3_SCORED_ID);
      await expect(panel).toHaveAttribute('data-scenario-id', expected.scenario_identity.scenario_id);
      await expect(panel).toHaveAttribute('data-result-sha256', expected.association.result_sha256);
      expect(await panel.innerText()).not.toMatch(DENYLIST);

      const scenarioIdBefore = expected.scenario_identity.scenario_id;
      const other = locale === 'en' ? 'ar' : 'en';
      await page.getByRole('link', {name: other === 'en' ? 'English' : 'العربية'}).click();
      await expect(page).toHaveURL(new RegExp(`/${other}/analysis/${M3_SCORED_ID}.*scenario=1`));
      await expect(page.getByTestId('scenario-panel')).toBeVisible();
      await expect(page.getByTestId('scenario-analysis-id')).toHaveText(M3_SCORED_ID);
      await expect(page.getByTestId('scenario-panel')).toHaveAttribute('data-scenario-id', scenarioIdBefore);
    });

    test('JSON export is deterministic and withholds numeric quantity fields', async ({page, request}) => {
      const api = await request.get(`/api/analyses/${M3_SCORED_ID}/scenario`);
      const scenario = (await api.json()) as ScenarioResponse;

      await page.goto(`/${locale}/analysis/${M3_SCORED_ID}?scenario=1`);
      await expect(page.getByTestId('scenario-panel')).toBeVisible();

      const exported = scenarioExportBytes(scenario);
      expect(exported).toBe(`${canonicalJson(scenario)}\n`);
      expect(exported).not.toMatch(/"value"\s*:/);
      expect(exported).not.toMatch(/"lower"\s*:/);
      expect(exported).not.toMatch(/"upper"\s*:/);
      const digest = createHash('sha256').update(exported).digest('hex');
      expect(digest).toBe(createHash('sha256').update(scenarioExportBytes(scenario)).digest('hex'));
    });
  });
}
