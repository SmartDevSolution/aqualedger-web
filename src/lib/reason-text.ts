'use client';

import {useTranslations} from 'next-intl';
import type english from '../../messages/en.json';

// Closed-vocabulary rendering of `{code, params}` reasons (DR-M3-01 §6). The backend emits no
// prose for M3 codes: the web owns exactly one en and one ar template per code under `reasons`,
// parity-checked by `npm run messages:check`. A code newer than this build renders the generic
// `_unknown` template with a correlation reference; the web never parses backend text.

export type ReasonKey = Exclude<keyof typeof english.reasons, '_unknown'>;
export type ReasonLike = {code: string; params?: Record<string, unknown> | undefined};
export type ConfounderKey = keyof typeof english.confounders;

const REASON_KEYS = [
  'MANDATORY_INPUT_MISSING', 'ZONE_FULLY_MASKED', 'NO_OBSERVATION_IN_WINDOW', 'RESOLUTION_INADEQUATE',
  'AGRI_MASK_BLOCKED', 'NOT_AGRICULTURAL', 'PERSISTENCE_INELIGIBLE', 'PERSISTENCE_UNKNOWN',
  'PERSISTENCE_NOT_ASSESSED', 'EVIDENCE_LIMITED', 'EVIDENCE_NOT_ASSESSED', 'INDEPENDENT_SUPPORT',
  'PERSISTENT_ANOMALY', 'RECURRENT_ANOMALY', 'ANOMALY_STRENGTH', 'NO_PERSISTENT_ANOMALY', 'TIED_RANK',
  'PRIORITY_CLASS_NOT_ESTABLISHED', 'FACTOR_SCORE', 'HAZE_CLOUD_DUST_MASKED', 'PROVISIONAL_AOI',
  'NO_INDEPENDENT_CORROBORATION', 'SAME_FAMILY_NOT_INDEPENDENT', 'CONTEXT_ONLY_SOURCE',
  'RESOLUTION_CONTEXT_ONLY', 'REVISION_INCOMPATIBLE', 'BASELINE_NOT_SEASON_MATCHED', 'TEMPORAL_GAPS',
  'FACTOR_NOT_APPLICABLE', 'FACTOR_NOT_ASSESSED', 'EVIDENCE_QUALITY_UNCALIBRATED'
] as const satisfies readonly ReasonKey[];

// The M2 prerequisite cause the pinned backend publishes in `params.m2_reason_code` of a
// PERSISTENCE_INELIGIBLE reason (scorecard.py:611-612). These are exactly the codes the pinned
// analysis/m2.py assigns to an INELIGIBLE PersistenceAssessment; each leaves the persistence outcome
// UNASSESSED, so the sentence states a missing prerequisite and never a "not persistent" result (F1).
// An unrecognised or absent cause yields no cause sentence: the client invents none.
const PERSISTENCE_CAUSES = ['NO_COMPATIBLE_BASELINE', 'EXCESSIVE_GAPS', 'AGRICULTURAL_MASK_BLOCKED'] as const;
type PersistenceCause = (typeof PERSISTENCE_CAUSES)[number];

function persistenceCause(reason: ReasonLike): PersistenceCause | null {
  if (reason.code !== 'PERSISTENCE_INELIGIBLE') return null;
  const code = reason.params?.m2_reason_code;
  return typeof code === 'string' && (PERSISTENCE_CAUSES as readonly string[]).includes(code)
    ? (code as PersistenceCause) : null;
}

const KNOWN: ReadonlySet<string> = new Set(REASON_KEYS);

export function isKnownReasonCode(code: string): code is ReasonKey {
  return KNOWN.has(code);
}

const CONFOUNDER_KEYS = [
  'GROWTH_STAGE', 'CROP_TYPE', 'SALINITY', 'WEATHER', 'MANAGEMENT', 'MASK_UNCERTAINTY',
  'MIXED_LAND_COVER', 'PROVISIONAL_AOI'
] as const satisfies readonly ConfounderKey[];

export function isKnownConfounderCode(code: string): code is (typeof CONFOUNDER_KEYS)[number] {
  return (CONFOUNDER_KEYS as readonly string[]).includes(code);
}

// Unicode isolates: ids, numbers and source names stay left-to-right inside an Arabic sentence
// (A38) even where the template is plain text and cannot carry a <bdi>.
const LRI = '\u2066';
const PDI = '\u2069';

export function isolate(value: string): string {
  return `${LRI}${value}${PDI}`;
}

function placeholderNames(template: string): string[] {
  return [...new Set([...template.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1] as string))];
}

function stringifyParam(value: unknown, familyName: (family: string) => string): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? familyName(item) : String(item)).join(', ');
  }
  // Numbers travel as literal strings so the digit policy is fixed once (A38): ICU would
  // otherwise re-format them per locale. Decimal strings are shown exactly as emitted.
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Returns a formatter for one reason; `reference` is the correlation id shown for an unknown code. */
export function useReasonText(reference: string) {
  const t = useTranslations('reasons');
  const families = useTranslations('zones.family');

  const familyName = (family: string): string => {
    switch (family) {
      case 'OPTICAL': return families('OPTICAL');
      case 'SAR': return families('SAR');
      case 'RAINFALL': return families('RAINFALL');
      default: return family;
    }
  };

  return (reason: ReasonLike): string => {
    if (!isKnownReasonCode(reason.code)) {
      return t('_unknown', {code: isolate(reason.code), reference: isolate(reference)});
    }
    const values: Record<string, string> = {};
    for (const name of placeholderNames(t.raw(reason.code) as string)) {
      values[name] = isolate(stringifyParam(reason.params?.[name], familyName));
    }
    const message = t(reason.code, values);
    const cause = persistenceCause(reason);
    return cause ? `${message} ${t(`PERSISTENCE_CAUSE_${cause}`)}` : message;
  };
}
