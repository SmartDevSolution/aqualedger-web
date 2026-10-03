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

// The M2 `Observation.missing_reason` vocabulary is NOT the M3 reason enum: the pinned backend
// publishes these typed codes (m2.py:195 `NOT_CONFIGURED`, :246/:277 `READ_FAILED:<cause>`,
// :353 `proof_reason or "NO_DECODABLE_STATISTIC"`, sources_m2.py:377-417 the decode-proof
// reasons, :1677 the coverage outcome). It is an open vocabulary — a `READ_FAILED:` composite
// carries the underlying cause — so an unknown value is explained in the reader's language and
// may only carry the raw code as an ADDITIONAL isolated diagnostic, never as the sole explanation.
const MISSING_REASON_CODES = [
  'NOT_CONFIGURED', 'NO_DECODE_PROOF', 'NO_VALID_PIXELS', 'NO_DECODABLE_STATISTIC', 'NO_INTERSECTING_BASIN'
] as const;
export type MissingReasonKey = (typeof MISSING_REASON_CODES)[number];
const MISSING_REASONS: ReadonlySet<string> = new Set(MISSING_REASON_CODES);
const READ_FAILED = 'READ_FAILED';

/** Localized explanation of an `Observation.missing_reason`; null stays null (no cell content). */
export function useMissingReasonText() {
  const t = useTranslations('evidenceMissing');
  return (code: string): string => {
    if (MISSING_REASONS.has(code)) return t(code as MissingReasonKey);
    if (code === READ_FAILED || code.startsWith(`${READ_FAILED}:`)) return t(READ_FAILED, {code: isolate(code)});
    return t('_unknown', {code: isolate(code)});
  };
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

// The v1 priority-class conclusion is valid for ONE body status only (DR-M3-01 §3/§8, Council
// condition 3). The rank fixture can carry a `PRIORITY_CLASS_NOT_ESTABLISHED` reason while the
// body's own `scoring.priority_class_status` says something else (round-3 F-02): rendered through
// this formatter the fixed conclusion would then assert a class state the body does not own. The
// formatter therefore consults the body's status and only states the fixed conclusion when it is
// `NOT_ESTABLISHED`; every other value (including an absent one) renders a status-bound sentence
// that asserts no concluded class. Read from the body, never inferred from the reason.
const PRIORITY_CLASS_NOT_ESTABLISHED = 'PRIORITY_CLASS_NOT_ESTABLISHED';
const PRIORITY_CLASS_STATUS_NOT_ESTABLISHED = 'NOT_ESTABLISHED';

/** Returns a formatter for one reason; `reference` is the correlation id shown for an unknown code. */
export function useReasonText(reference: string, priorityClassStatus?: string | null) {
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
    // Bound to the body's own status (Council condition 3, round-3 F-02): a body whose status is
    // not `NOT_ESTABLISHED` never renders the fixed "a priority class is not established" sentence
    // from a reason — on any surface that renders priority reasons (panel row, card, print).
    if (reason.code === PRIORITY_CLASS_NOT_ESTABLISHED && priorityClassStatus !== PRIORITY_CLASS_STATUS_NOT_ESTABLISHED) {
      return priorityClassStatus === undefined || priorityClassStatus === null
        ? t('PRIORITY_CLASS_STATUS_ABSENT')
        : t('PRIORITY_CLASS_STATUS_UNRECOGNISED', {status: isolate(priorityClassStatus)});
    }
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
