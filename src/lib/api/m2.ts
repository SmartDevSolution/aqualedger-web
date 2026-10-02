import type {components} from './generated';

// M2 additive-block consumption (contract 0.2.0): `AnalysisResult.m2` is optional and nullable.
// A result without it is a pre-M2 result — "not collected under this contract", never a zero.
// This module validates the block as the contract defines it; presentation stays M3-5 scope.

export type M2ResultAdditions = NonNullable<components['schemas']['AnalysisResult']['m2']>;

export function isM2ResultAdditions(value: unknown): value is M2ResultAdditions {
  if (!isRecord(value)) return false;
  if (typeof value.method_version !== 'string' || typeof value.pipeline_version !== 'string'
    || typeof value.config_version !== 'string') return false;
  if (value.agricultural_eligibility !== undefined && typeof value.agricultural_eligibility !== 'string') return false;
  if (value.zones !== undefined && !isList(value.zones, isZone)) return false;
  if (value.coverage !== undefined && !isList(value.coverage, isCoverageGap)) return false;
  if (value.observations !== undefined && !isList(value.observations, isObservation)) return false;
  if (value.source_manifest !== undefined && !isList(value.source_manifest, isSourceEvidence)) return false;
  if (value.source_checks !== undefined && !isList(value.source_checks, isM2SourceCheck)) return false;
  if (value.limitations !== undefined && !isList(value.limitations, isRecord)) return false;
  if (value.mask_semantics !== undefined && !(value.mask_semantics === null || isRecord(value.mask_semantics))) return false;
  if (value.provenance !== undefined && !isRecord(value.provenance)) return false;
  if (value.baseline !== undefined && !(value.baseline === null || isSeasonalBaseline(value.baseline))) return false;
  if (value.persistence !== undefined && !isPersistenceAssessment(value.persistence)) return false;
  return true;
}

function isZone(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.zone_id === 'string'
    && isRecord(value.geometry)
    && typeof value.geometry_version === 'string'
    && typeof value.geometry_hash === 'string'
    && typeof value.area_m2 === 'number'
    && (value.covered_area_m2 === undefined || value.covered_area_m2 === null || typeof value.covered_area_m2 === 'number');
}

function isCoverageGap(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.source_id === 'string'
    && isIsoDate(value.window_start)
    && isIsoDate(value.window_end)
    && typeof value.reason_code === 'string'
    && isCount(value.observed_count)
    && (value.expected_count === undefined || value.expected_count === null || isCount(value.expected_count))
    && (value.coverage_fraction === undefined || value.coverage_fraction === null || typeof value.coverage_fraction === 'number');
}

function isObservation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isObservationIndicator(value.indicator)
    && isIsoDate(value.window_start)
    && isIsoDate(value.window_end)
    && isObservationClass(value.observation_class)
    && isCount(value.valid_count)
    && (value.value === undefined || value.value === null || typeof value.value === 'number')
    && (value.unit === undefined || value.unit === null || typeof value.unit === 'string')
    && (value.valid_area_fraction === undefined || value.valid_area_fraction === null || typeof value.valid_area_fraction === 'number')
    && (value.missing_reason === undefined || value.missing_reason === null || typeof value.missing_reason === 'string')
    && (value.source_refs === undefined || isList(value.source_refs, isText));
}

function isObservationIndicator(value: unknown): boolean {
  return value === 'NDVI' || value === 'NDMI' || value === 'RAINFALL' || value === 'RADAR_CONTEXT';
}

function isObservationClass(value: unknown): boolean {
  return value === 'OBSERVED' || value === 'DERIVED' || value === 'MISSING';
}

function isSourceEvidence(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.source_id !== 'string' || typeof value.role !== 'string'
    || typeof value.status !== 'string' || typeof value.product !== 'string') return false;
  for (const field of ['acquisition_date', 'represented_date'] as const) {
    if (value[field] !== undefined && !(value[field] === null || isIsoDate(value[field]))) return false;
  }
  for (const field of ['crs', 'revision', 'version', 'reason_code'] as const) {
    if (value[field] !== undefined && !(value[field] === null || typeof value[field] === 'string')) return false;
  }
  if (value.native_resolution_m !== undefined && !(value.native_resolution_m === null || typeof value.native_resolution_m === 'number')) return false;
  if (value.resource_bytes !== undefined && !(value.resource_bytes === null || isCount(value.resource_bytes))) return false;
  if (value.intersection !== undefined && !(value.intersection === null || typeof value.intersection === 'boolean')) return false;
  if (value.processing !== undefined && !isRecord(value.processing)) return false;
  if (value.provenance !== undefined && !isRecord(value.provenance)) return false;
  if (value.sample !== undefined && !(value.sample === null || isRecord(value.sample))) return false;
  return true;
}

function isM2SourceCheck(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.source_id === 'string'
    && isM2SourceCheckStatus(value.status)
    && typeof value.check_scope === 'string'
    && (value.checked_at === undefined || value.checked_at === null || isIsoTimestamp(value.checked_at))
    && (value.reason === undefined || value.reason === null || typeof value.reason === 'string')
    && (value.reason_code === undefined || value.reason_code === null || typeof value.reason_code === 'string');
}

// The M2 source-check vocabulary (SourceCheckStatus in the pinned artifact) — distinct from the
// M1 `GET /sources` check status, which is lowercase and has its own validator in client.ts.
function isM2SourceCheckStatus(value: unknown): boolean {
  return value === 'NOT_CHECKED' || value === 'REACHABLE' || value === 'FAILED' || value === 'DEFERRED_NOT_CONFIGURED';
}

function isSeasonalBaseline(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isSeasonalBaselineStatus(value.status)
    && typeof value.method === 'string'
    && (value.completeness === undefined || value.completeness === null || typeof value.completeness === 'number')
    && (value.observation_count === undefined || isCount(value.observation_count))
    && (value.reference_start === undefined || value.reference_start === null || isIsoDate(value.reference_start))
    && (value.reference_end === undefined || value.reference_end === null || isIsoDate(value.reference_end))
    && (value.source_revision === undefined || value.source_revision === null || typeof value.source_revision === 'string');
}

function isSeasonalBaselineStatus(value: unknown): boolean {
  return value === 'AVAILABLE' || value === 'UNAVAILABLE' || value === 'INCOMPATIBLE';
}

function isPersistenceAssessment(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isPersistenceEligibility(value.eligibility)
    && typeof value.reason_code === 'string'
    && typeof value.explanation_en === 'string'
    && typeof value.explanation_ar === 'string';
}

function isPersistenceEligibility(value: unknown): boolean {
  return value === 'NOT_ASSESSED' || value === 'ELIGIBLE' || value === 'INELIGIBLE' || value === 'UNKNOWN';
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

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
