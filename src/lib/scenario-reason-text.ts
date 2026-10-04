'use client';

import {useLocale, useTranslations} from 'next-intl';
import type english from '../../messages/en.json';
import {isolate} from './reason-text';

export type ScenarioReasonKey = Exclude<keyof typeof english.scenarioReasons, '_unknown'>;

const KNOWN = new Set<string>([
  'SCENARIO_NOT_EMPIRICALLY_ANCHORED',
  'NO_LOCAL_BASIS',
  'BASIN_SAVINGS_INPUTS_MISSING',
  'YIELD_RESPONSE_NOT_MODELLED',
  'SCENARIO_UNCERTAINTY_NOT_ASSESSED'
]);

function formatList(values: unknown[], locale: string): string {
  if (values.length === 0) return '';
  return new Intl.ListFormat(locale, {style: 'short', type: 'conjunction'}).format(values.map((entry) => String(entry)));
}

export function useScenarioReasonText() {
  const t = useTranslations('scenarioReasons');
  const locale = useLocale();

  return (reason: {code: string; params?: Record<string, unknown> | undefined}): string => {
    if (!KNOWN.has(reason.code)) {
      return t('_unknown', {code: isolate(reason.code)});
    }
    const key = reason.code as ScenarioReasonKey;
    const params = reason.params ?? {};
    if (key === 'SCENARIO_NOT_EMPIRICALLY_ANCHORED' || key === 'NO_LOCAL_BASIS') {
      const quantities = Array.isArray(params.quantities) ? params.quantities.map(String) : [];
      return t(key, {quantities: formatList(quantities, locale)});
    }
    if (key === 'BASIN_SAVINGS_INPUTS_MISSING') {
      const terms = Array.isArray(params.terms) ? params.terms.map(String) : [];
      return t(key, {terms: formatList(terms, locale)});
    }
    return t(key);
  };
}
