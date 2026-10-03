import type {components} from './generated';

// M3 additive-envelope consumption (DR-M3-01 §4, contract 0.2.0).
//
// The backend emits three additive, nullable result fields for results computed under
// `aq-scorecard-1`: `scoring`, per-zone `assessment` and `result_identity`. A pre-M3 result
// omits all three, which means "not scored under this method" — never UNRANKED, never a zero,
// never a substituted class. This module is the single place that validates and reads them;
// presentation components branch on presence, never on inferred defaults.

export type M3ResultIdentity = NonNullable<components['schemas']['AnalysisResult']['result_identity']>;
export type M3Scoring = NonNullable<components['schemas']['AnalysisResult']['scoring']>;
export type M3ZoneAssessment = NonNullable<components['schemas']['AnalysisResult']['assessment']>[number];
export type M3ReasonCode = components['schemas']['M3ReasonCode'];

/** A result that carries the complete M3 scoring envelope (all-or-nothing per DR-M3-01 §4). */
export type M3ScoredResult = AnalysisResult & {
  scoring: M3Scoring;
  assessment: NonNullable<components['schemas']['AnalysisResult']['assessment']>;
  result_identity: M3ResultIdentity;
};

// Imported after the type block for readability; `AnalysisResult` is a pure type alias.
import type {AnalysisResult} from './client';

const EVIDENCE_QUALITY_CLASSES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const PRIORITY_STATUSES = ['RANKED', 'UNRANKED'] as const;
const SUFFICIENCY_STATUSES = ['PASS', 'INSUFFICIENT DATA'] as const;
export const EVIDENCE_QUALITY_UNCALIBRATED_CODE = 'EVIDENCE_QUALITY_UNCALIBRATED';

export function isM3ResultIdentity(value: unknown): value is M3ResultIdentity {
  return isRecord(value)
    && isUuid(value.analysis_id)
    && isUuid(value.attempt_id)
    && typeof value.result_sha256 === 'string';
}

export function isM3Scoring(value: unknown): value is M3Scoring {
  if (!isRecord(value)) return false;
  return typeof value.method_version === 'string'
    && typeof value.operationalization_version === 'string'
    && typeof value.scorecard_source_sha256 === 'string'
    && isCount(value.ranked_count)
    && isCount(value.unranked_count)
    && (value.computed_at === undefined || value.computed_at === null || isIsoTimestamp(value.computed_at))
    && (value.priority_class_status === undefined || typeof value.priority_class_status === 'string');
}

export function isM3Assessment(value: unknown): value is NonNullable<components['schemas']['AnalysisResult']['assessment']> {
  return Array.isArray(value) && value.every(isZoneAssessment);
}

/**
 * Total all-or-nothing check for the M3 envelope. `scoring`, `assessment` and
 * `result_identity` travel together (§4 envelope rule): a body carrying only some of them is
 * contract-invalid, so none of them is consumed. The contract-level rejection happens once in
 * `isAnalysisResult` (`client.ts`), which rejects such a body before any consumer sees it; this
 * predicate is the presentation-level check and now asserts the same three fields, so a consumer
 * holding an `AnalysisResult` from another source cannot bypass the identity requirement either.
 */
export function isM3Envelope(result: AnalysisResult): result is M3ScoredResult {
  if (result.scoring === undefined || result.scoring === null) return false;
  if (result.assessment === undefined || result.assessment === null) return false;
  if (result.result_identity === undefined || result.result_identity === null) return false;
  return isM3Scoring(result.scoring)
    && isM3Assessment(result.assessment)
    && isM3ResultIdentity(result.result_identity);
}

export function isZoneAssessment(value: unknown): value is M3ZoneAssessment {
  if (!isRecord(value)) return false;
  if (typeof value.zone_id !== 'string') return false;
  if (typeof value.evidence_status !== 'string') return false;
  if (!isSufficiencyBlock(value.sufficiency)) return false;
  if (!isEvidenceQualityBlock(value.evidence_quality)) return false;
  if (!isPriorityBlock(value.priority)) return false;
  if (value.confounders !== undefined && !isList(value.confounders, isConfounder)) return false;
  if (value.evidence_refs !== undefined && !isList(value.evidence_refs, isEvidenceRef)) return false;
  if (value.independent_families !== undefined && !isList(value.independent_families, isIndependentFamily)) return false;
  if (value.geometry_hash !== undefined && !(value.geometry_hash === null || typeof value.geometry_hash === 'string')) return false;
  if (value.geometry_version !== undefined
    && !(value.geometry_version === null || typeof value.geometry_version === 'string' || isCount(value.geometry_version))) return false;
  return true;
}

function isSufficiencyBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!SUFFICIENCY_STATUSES.includes(value.status as never)) return false;
  if (value.failed_factors !== undefined && !isList(value.failed_factors, isText)) return false;
  if (value.reasons !== undefined && !isList(value.reasons, isReason)) return false;
  return true;
}

function isEvidenceQualityBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isList(value.factors ?? [], isFactorRow)) return false;
  if (value.class !== undefined && !(value.class === null
    || (typeof value.class === 'string' && EVIDENCE_QUALITY_CLASSES.includes(value.class as never)))) return false;
  for (const field of ['c', 'm', 'o', 'display', 'label'] as const) {
    if (value[field] !== undefined && !(value[field] === null || typeof value[field] === 'string')) return false;
  }
  if (value.display_decimals !== undefined && !(value.display_decimals === null || isCount(value.display_decimals))) return false;
  if (value.label_code !== undefined && typeof value.label_code !== 'string') return false;
  if (value.top_reasons !== undefined && !(value.top_reasons === null || isList(value.top_reasons, isReason))) return false;
  return true;
}

function isPriorityBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!PRIORITY_STATUSES.includes(value.status as never)) return false;
  if (value.rank !== undefined && !(value.rank === null || isCount(value.rank))) return false;
  if (value.rank_group !== undefined && !(value.rank_group === null || isCount(value.rank_group))) return false;
  if (value.rank_key !== undefined && !(value.rank_key === null || isRankKey(value.rank_key))) return false;
  if (value.reasons !== undefined && !isList(value.reasons, isReason)) return false;
  return true;
}

function isRankKey(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isCount(value.independent_family_count)
    && isCount(value.persistence_windows)
    && isCount(value.recurrence_windows)
    && typeof value.anomaly_strength === 'string'
    && typeof value.zone_id === 'string';
}

function isFactorRow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.factor_id !== 'string' || typeof value.score !== 'string') return false;
  if (typeof value.applicable !== 'boolean' || typeof value.assessed !== 'boolean') return false;
  if (value.reason !== undefined && !(value.reason === null || isReason(value.reason))) return false;
  return true;
}

function isConfounder(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.code === 'string'
    && typeof value.assessed === 'boolean'
    && (value.params === undefined || isRecord(value.params));
}

function isIndependentFamily(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.family === 'string'
    && isList(value.source_ids, isText)
    && typeof value.eligible === 'boolean'
    && typeof value.adverse_signal === 'boolean'
    && typeof value.counted === 'boolean'
    && (value.reason === undefined || value.reason === null || isReason(value.reason));
}

function isEvidenceRef(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.source_id !== 'string' || typeof value.family !== 'string') return false;
  if (value.product !== undefined && !(value.product === null || typeof value.product === 'string')) return false;
  if (value.revision !== undefined && !(value.revision === null || typeof value.revision === 'string')) return false;
  if (value.dates !== undefined && !isList(value.dates, isText)) return false;
  return true;
}

function isReason(value: unknown): boolean {
  if (!isRecord(value) || typeof value.code !== 'string') return false;
  return value.params === undefined || isRecord(value.params);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isList(value: unknown, check: (item: unknown) => boolean): value is unknown[] {
  return Array.isArray(value) && value.every(check);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
