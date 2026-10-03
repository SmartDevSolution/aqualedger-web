import {createHash} from 'node:crypto';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';

// A labelled test double for the pinned M1 backend contract. It is not a mock of the browser's
// network layer: the Next.js relay (src/lib/api/relay.ts) makes a real server-to-server HTTP call
// to this process, so it is the only way to observe what the relay actually sends (Bearer
// presence, Idempotency-Key forwarding, a dropped inbound Authorization) without the interception
// happening before the request ever reaches the relay.

export const TEST_OPERATOR_TOKEN = 'e2e-relay-test-operator-token-not-a-secret';

export const SUCCEEDED_ID = '11111111-1111-4111-8111-111111111111';
export const FAILED_ID = '22222222-2222-4222-8222-222222222222';
export const QUEUED_ID = '33333333-3333-4333-8333-333333333333';
// A result whose ndvi_preview `preview_url` points back at this same double's own
// `/__test__/preview-bytes` route (a small fixture GeoTIFF), so the same-origin preview route
// (src/app/api/analyses/[id]/preview/route.ts) has a real, fetchable signed URL to resolve for the
// "ready" decode-and-render path (W6.5), distinct from the other IDs whose preview_url is an
// unreachable placeholder host (the honest fetch-failed path).
export const PREVIEW_READY_ID = '44444444-4444-4444-8444-444444444444';
// A committed result with no ndvi_preview artifact at all (an empty `artifacts` array — never an
// omitted field, per the frozen contract's "absent means not offered" rule), for the preview
// route's PREVIEW_ARTIFACT_MISSING path.
export const NO_ARTIFACT_ID = '55555555-5555-4555-8555-555555555555';
// A committed result whose ndvi_preview artifact exists but is not `ready` (no preview_url), for
// the preview route's PREVIEW_ARTIFACT_NOT_READY path.
export const ARTIFACT_NOT_READY_ID = '66666666-6666-4666-8666-666666666666';
// A committed result whose ndvi_preview artifact IS `ready` but carries no `preview_url` — mirrors
// the real backend leaving `preview_url` unset whenever its storage client is not configured
// (`work/backend/src/aqualedger/api/routes/analyses.py:195-201` `build_storage_client`), which is
// conditional on backend deployment config, not the artifact's own readiness. For the preview
// route's PREVIEW_URL_UNAVAILABLE path, distinct from ARTIFACT_NOT_READY_ID above.
export const ARTIFACT_URL_UNAVAILABLE_ID = '77777777-7777-4777-8777-777777777777';
// An id the double genuinely rejects at `/result` with a non-200 that is not the frozen NOT_READY
// envelope — mirrors the real backend's `404 NOT_FOUND` from `get_analysis_result` when the row
// does not exist or belongs to a different principal (`analyses.py`: `if row is None: raise
// AppError(ErrorCode.NOT_FOUND, ...)`). Establishes the preview route's PREVIEW_RESULT_UNAVAILABLE
// path with a real backend response, instead of a fabricated one.
export const RESULT_NOT_FOUND_ID = '88888888-8888-4888-8888-888888888888';
// An A17-shaped result (Council finding F1): evidence_status INSUFFICIENT, no persisted statistics,
// no committed ndvi_preview artifact, and a single top-level limitation carrying the exact
// acquisition/coverage reason code the hosted acceptance run observed the backend publish as a
// limitation. The catalogue already ships a translation for this code as a scene
// `rejection_reason`; before the W12 fix `limitationMessageKey` did not also recognize it here.
export const NO_SCENES_FOUND_ID = '99999999-9999-4999-8999-999999999999';
// Same A17 shape, but for the other reason code the acceptance run observed as a limitation: every
// evaluated date was rejected. Faithful to the real below-guard payload shape
// (work/backend/src/aqualedger/analysis/pipeline.py:295-315): `scenes_evaluated` retains the
// rejected date (never `[]`) and, because a mosaic was actually built before the coverage check
// rejected it, the run also carries `EFFECTIVE_QUALITY_RESOLUTION_20M` (G19).
export const NO_ELIGIBLE_ACQUISITION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// Same top-level limitation code, but for the other real cause the pipeline can produce it from:
// every evaluated date was rejected before a mosaic (and therefore coverage) was ever computed
// (`TOO_MANY_TILES_FOR_DATE` / `BOA_OFFSET_NOT_ASSERTED`, pipeline.py:165-195). No mosaic means no
// `EFFECTIVE_QUALITY_RESOLUTION_20M` limitation here, unlike the below-guard id above — proves the
// rendered `NO_ELIGIBLE_ACQUISITION` text stays truthful for a cause where coverage was never
// defined, not only the below-guard cause (W13, independent review BLOCK point 1).
export const NO_ELIGIBLE_ACQUISITION_UNDEFINED_COVERAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
// A SUCCEEDED, `selected: true` result whose winner mosaic yielded zero valid NDVI pixels (D2,
// pipeline.py:338-342): evidence_status INSUFFICIENT with a real, non-empty (if all-zero/null)
// statistics object, distinct from the no-eligible-date ids above which never select a winner at
// all. Proves `NO_VALID_PIXEL_IN_SELECTED_DATE` now renders its own catalogue text instead of the
// unknown-limitation fallback (W13, independent review BLOCK point 2).
export const NO_VALID_PIXEL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
// A SUCCEEDED result carrying the complete M3 scoring envelope (contract 0.2.0): `scoring`,
// two per-zone `assessment` entries (one RANKED with an evidence-quality class, one UNRANKED
// with a reason) and `result_identity`. Labelled test double content — not a production claim.
export const M3_SCORED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae1';
// A SUCCEEDED result computed under aq-scorecard-1 whose zone never passed the gates, so the
// backend emitted NO scoring envelope at all — per DR-M3-01 §4 this renders as "not scored
// under this method", never as UNRANKED.
// A scored result served only after a delay and carrying different zones/hash: the late-response
// test navigates away from it and proves it is never displayed under the newer route id (A39).
export const M3_SLOW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae2';
export const M3_SLOW_DELAY_MS = 2500;
export const M3_NOT_SCORED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaf1';
// A FAILED run whose single `errors[].code` is a real per-date-only rejection code
// (`LOW_VALID_COVERAGE`, pipeline.py:246-261) rather than anything the run-level
// `failure_reason_code` path can actually publish (`SOURCE_READ_FAILED`, `SOURCE_UNAVAILABLE`,
// `PROCESSING_FAILED` — worker/runner.py's `_fail` call sites). Proves the run-level and per-date
// reason vocabularies are kept separate: this must render the honest unknown-reason fallback, never
// the per-date `LOW_VALID_COVERAGE` translation (W14).
export const FAILED_WRONG_PATH_CODE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad';
// The ndvi_preview artifact bounds/CRS every committed-result fixture above shares, exported so
// tests can derive the expected map placement from the same values instead of duplicating them.
export const PREVIEW_ARTIFACT_BOUNDS = {minx: 100, miny: 200, maxx: 300, maxy: 400};
export const PREVIEW_ARTIFACT_CRS = 'EPSG:32638';
export const CONFLICT_START_DATE = '2001-01-01';
// A non-secret marker embedded in the default (unreachable) preview_url's query string, so a log
// scan can assert the signed URL is never printed without needing the real operator token.
export const PREVIEW_URL_TOKEN = 'preview-url-marker-not-a-secret';

type JsonValue = Record<string, unknown> | unknown[];

type LoggedRequest = {
  method: string | undefined;
  path: string;
  hasAuthorization: boolean;
  authorization: string | null;
  idempotencyKey: string | null;
  body: JsonValue | null;
};

function statusFixture(
  id: string,
  executionStatus: string,
  evidenceStatus?: string,
  failureCode = 'SOURCE_READ_FAILED'
): Record<string, unknown> {
  const base = {
    analysis_id: id,
    execution_status: executionStatus,
    start_date: '2026-08-01',
    end_date: '2026-08-30',
    created_at: '2026-09-24T12:00:00Z',
    updated_at: '2026-09-24T12:01:00Z',
    warnings: [],
    errors: executionStatus === 'FAILED' ? [{code: failureCode, params: {band: 'nir'}}] : []
  };
  return executionStatus === 'FAILED' ? base : {...base, evidence_status: evidenceStatus};
}

export function resultFixture(id: string, previewUrl = `https://private.invalid/signed?token=${PREVIEW_URL_TOKEN}`): Record<string, unknown> {
  return {
    analysis_id: id,
    schema_version: '1',
    pipeline_version: 'm1-pipeline-test',
    method_version: 'ndvi-test',
    execution_status: 'SUCCEEDED',
    evidence_status: 'NOT_ASSESSED',
    request: {
      aoi_geojson: {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]},
      start_date: '2026-08-01',
      end_date: '2026-08-30',
      locale: 'en'
    },
    effective_coverage: {acquisition_date: '2026-08-30', valid_coverage_fraction: 0.85, min_valid_coverage_fraction_guard: 0.5},
    statistics: {
      valid_observation_count: 1200,
      valid_area_m2: 120000,
      ndvi_min: -0.15,
      ndvi_max: 0.79,
      ndvi_mean: 0.42,
      ndvi_median: 0.44,
      ndvi_p05: 0.08,
      ndvi_p95: 0.71,
      masked_fraction: 0.12,
      rejection_counts: {masked_class: 20, missing_data: 4, non_positive_denominator: 0, out_of_range: 0}
    },
    scenes_evaluated: [{
      acquisition_date: '2026-08-30',
      valid_coverage_fraction: 0.85,
      selected: true,
      item_ids: ['Sentinel-2 item A'],
      rejection_reason: null,
      data_present_overlap_count: 1500,
      masked_yielded_coverage_count: 1200,
      discarded_candidates: [],
      failures: []
    }, {
      // Eligible but lost the B2 rule 5 total order to the winner above: a real, non-error
      // `rejection_reason: null` on a non-selected date (W11 / R1).
      acquisition_date: '2026-08-25',
      valid_coverage_fraction: 0.6,
      selected: false,
      item_ids: ['Sentinel-2 item B'],
      rejection_reason: null,
      data_present_overlap_count: 1400,
      masked_yielded_coverage_count: 900,
      discarded_candidates: [],
      failures: []
    }, {
      // A non-null reason this web version's catalogue does not recognize (simulates a backend
      // code added after this build), so the fallback still needs the honest "unrecognized" text.
      acquisition_date: '2026-08-20',
      valid_coverage_fraction: 0.3,
      selected: false,
      item_ids: ['Sentinel-2 item C'],
      rejection_reason: 'FUTURE_UNRECOGNIZED_REASON',
      data_present_overlap_count: 1200,
      masked_yielded_coverage_count: 300,
      discarded_candidates: [],
      failures: []
    }, {
      // A real top-level-only code (`NDVI_OUT_OF_RANGE_PIXELS_REJECTED`, a `limitations[].code` the
      // pipeline never assigns to a per-date `rejection_reason`) placed in the per-date slot. Proves
      // the per-date and run-level/limitation reason vocabularies stay separate: this must render
      // the honest unknown-reason fallback, never the top-level NDVI translation (W14).
      acquisition_date: '2026-08-18',
      valid_coverage_fraction: 0.1,
      selected: false,
      item_ids: ['Sentinel-2 item G'],
      rejection_reason: 'NDVI_OUT_OF_RANGE_PIXELS_REJECTED',
      data_present_overlap_count: 1100,
      masked_yielded_coverage_count: 200,
      discarded_candidates: [],
      failures: []
    }],
    provenance: {
      source_id: 'sentinel2_l2a_earth_search',
      provider: 'Earth Search',
      collection: 'sentinel-2-l2a',
      item_ids: ['Sentinel-2 item A'],
      asset_hrefs: {},
      acquisition_datetime: '2026-08-30T08:20:00Z',
      processing_baseline: '05.11',
      scale: 0.0001,
      offset: 0,
      mask_policy: 'SCL M1 policy',
      mask_masked_classes: [0, 1, 3, 8, 9, 10, 11],
      mask_retained_classes: [2, 4, 5, 6, 7],
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      grid_origin: [100, 200],
      resampling: {red: 'nearest', nir: 'nearest'},
      resampling_scl: 'nearest',
      aoi_hash: 'fixture-only',
      stac_query: {}
    },
    baseline: {
      contract_version: '0.1.0',
      collection: 'sentinel-2-l2a',
      offset_rule: 'boa_offset_applied',
      mask_policy_version: 'scl-m1-v1',
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      pipeline_version: 'm1-pipeline-test'
    },
    artifacts: [{
      kind: 'ndvi_preview',
      storage_key: 'private/fixture-only',
      hash: 'sha256:fixture-only',
      size_bytes: 1200,
      resolution_m: 10,
      crs: PREVIEW_ARTIFACT_CRS,
      bounds: PREVIEW_ARTIFACT_BOUNDS,
      ready: true,
      preview_url: previewUrl
    }],
    limitations: [
      {code: 'EFFECTIVE_QUALITY_RESOLUTION_20M', params: {}},
      // A limitation code this web version's catalogue does not recognize, so the limitation
      // fallback needs its own assertion distinct from the scene-reason fallback (W11 gap #4).
      {code: 'FUTURE_UNRECOGNIZED_LIMITATION', params: {}}
    ]
  };
}

// Mirrors the A17 hosted acceptance run's shape: no eligible observation was committed, so there
// is nothing to score or preview — only the honest INSUFFICIENT-evidence state and the reason the
// backend reports as a top-level limitation, not a per-scene rejection_reason. `scenesEvaluated`
// and `limitations` are supplied by each caller so every case stays faithful to the real payload
// shape the pinned pipeline produces for it (W13, independent review BLOCK point 3) instead of
// always collapsing to an empty `scenes_evaluated: []`.
function insufficientResultFixture(
  id: string,
  scenesEvaluated: Record<string, unknown>[],
  limitations: Record<string, unknown>[]
): Record<string, unknown> {
  return {
    analysis_id: id,
    schema_version: '1',
    pipeline_version: 'm1-pipeline-test',
    method_version: 'ndvi-test',
    execution_status: 'SUCCEEDED',
    evidence_status: 'INSUFFICIENT',
    request: {
      aoi_geojson: {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]},
      start_date: '2026-08-01',
      end_date: '2026-08-30',
      locale: 'en'
    },
    effective_coverage: {acquisition_date: null, valid_coverage_fraction: null, min_valid_coverage_fraction_guard: 0.5},
    statistics: null,
    scenes_evaluated: scenesEvaluated,
    provenance: null,
    baseline: {
      contract_version: '0.1.0',
      collection: 'sentinel-2-l2a',
      offset_rule: 'boa_offset_applied',
      mask_policy_version: 'scl-m1-v1',
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      pipeline_version: 'm1-pipeline-test'
    },
    artifacts: [],
    limitations
  };
}

// A SUCCEEDED, `selected: true` result whose winner mosaic yielded zero valid NDVI pixels (D2,
// pipeline.py:338-342): `effective_coverage` is populated from the real winner (unlike the
// no-eligible-date fixtures above, which never select one), but `statistics` is the real "empty"
// shape the worker still publishes for this corner (worker/runner.py:286-303) — a present object
// with `valid_observation_count: 0` and null NDVI aggregates, never a null `statistics`.
function noValidPixelResultFixture(id: string): Record<string, unknown> {
  return {
    analysis_id: id,
    schema_version: '1',
    pipeline_version: 'm1-pipeline-test',
    method_version: 'ndvi-test',
    execution_status: 'SUCCEEDED',
    evidence_status: 'INSUFFICIENT',
    request: {
      aoi_geojson: {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]},
      start_date: '2026-08-01',
      end_date: '2026-08-30',
      locale: 'en'
    },
    effective_coverage: {acquisition_date: '2026-08-30', valid_coverage_fraction: 0.85, min_valid_coverage_fraction_guard: 0.5},
    statistics: {
      valid_observation_count: 0,
      valid_area_m2: 0,
      ndvi_min: null,
      ndvi_max: null,
      ndvi_mean: null,
      ndvi_median: null,
      ndvi_p05: null,
      ndvi_p95: null,
      masked_fraction: 1,
      rejection_counts: {masked_class: 1500, missing_data: 0, non_positive_denominator: 0, out_of_range: 0}
    },
    scenes_evaluated: [{
      acquisition_date: '2026-08-30',
      valid_coverage_fraction: 0.85,
      selected: true,
      item_ids: ['Sentinel-2 item A'],
      rejection_reason: null,
      data_present_overlap_count: 1500,
      masked_yielded_coverage_count: 1500,
      discarded_candidates: [],
      failures: []
    }],
    provenance: {
      source_id: 'sentinel2_l2a_earth_search',
      provider: 'Earth Search',
      collection: 'sentinel-2-l2a',
      item_ids: ['Sentinel-2 item A'],
      asset_hrefs: {},
      acquisition_datetime: '2026-08-30T08:20:00Z',
      processing_baseline: '05.11',
      scale: 0.0001,
      offset: 0,
      mask_policy: 'SCL M1 policy',
      mask_masked_classes: [0, 1, 3, 8, 9, 10, 11],
      mask_retained_classes: [2, 4, 5, 6, 7],
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      grid_origin: [100, 200],
      resampling: {red: 'nearest', nir: 'nearest'},
      resampling_scl: 'nearest',
      aoi_hash: 'fixture-only',
      stac_query: {}
    },
    baseline: {
      contract_version: '0.1.0',
      collection: 'sentinel-2-l2a',
      offset_rule: 'boa_offset_applied',
      mask_policy_version: 'scl-m1-v1',
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      pipeline_version: 'm1-pipeline-test'
    },
    artifacts: [],
    limitations: [
      {code: 'EFFECTIVE_QUALITY_RESOLUTION_20M', params: {}},
      {code: 'NO_VALID_PIXEL_IN_SELECTED_DATE', params: {}}
    ]
  };
}

// Canonical form used for `result_sha256` (DR-M3-01 §8): sorted keys (by code point), no
// insignificant whitespace, non-ASCII preserved. Independently implemented here so the e2e tests
// cross-check the web's own verifier against a second implementation, not against itself.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

export function fixtureResultSha256(body: Record<string, unknown>): string {
  const payload: Record<string, unknown> = {};
  for (const key of ['analysis_id', 'execution_status', 'scoring', 'assessment']) {
    if (key in body) payload[key] = body[key];
  }
  return createHash('sha256').update(canonical(payload), 'utf8').digest('hex');
}

const FACTOR_IDS = ['M1', 'M2', 'M3', 'M4', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8'];

function factorRows(): Record<string, unknown>[] {
  return FACTOR_IDS.map((factorId) => {
    if (factorId === 'O4' || factorId === 'O5') {
      return {factor_id: factorId, score: '0', applicable: true, assessed: false, reason: {code: 'FACTOR_NOT_ASSESSED', params: {factor_id: factorId}}};
    }
    if (factorId === 'O6') {
      return {factor_id: factorId, score: '0', applicable: false, assessed: false, reason: {code: 'FACTOR_NOT_APPLICABLE', params: {factor_id: factorId}}};
    }
    if (factorId === 'O1') {
      return {factor_id: factorId, score: '0.75', applicable: true, assessed: true, reason: {code: 'PROVISIONAL_AOI', params: {}}};
    }
    return {factor_id: factorId, score: '1', applicable: true, assessed: true, reason: null};
  });
}

function stripClassTest(strip: number): Record<string, unknown> {
  const left = strip * 0.0025;
  return {type: 'Polygon', coordinates: [[[left, 0], [left + 0.0025, 0], [left + 0.0025, 0.01], [left, 0.01], [left, 0]]]};
}

// A SUCCEEDED result carrying the complete M3 scoring envelope (contract 0.2.0) plus the M2 block
// the zone views read: four zones — Z-1 RANKED (rank 1, group 1, class HIGH), Z-3 RANKED (rank 2,
// group 2, class LOW), Z-2 UNRANKED (MANDATORY_INPUT_MISSING) and Z-4 UNRANKED with a reason code
// this web build does not know (FUTURE_CODE_X). All values are labelled test-double content, never
// a production claim. `result_identity.result_sha256` is the REAL digest of the served payload.
function m3ScoredResultFixture(id: string, variant: 'main' | 'slow' = 'main'): Record<string, unknown> {
  const zoneSuffix = variant === 'slow' ? 'S' : '';
  const body: Record<string, unknown> = {
    analysis_id: id,
    schema_version: '1',
    pipeline_version: 'm3-pipeline-test',
    method_version: 'ndvi-test',
    execution_status: 'SUCCEEDED',
    evidence_status: 'SUFFICIENT',
    request: {
      aoi_geojson: {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]},
      start_date: '2026-08-01',
      end_date: '2026-08-30',
      locale: 'en'
    },
    effective_coverage: {acquisition_date: '2026-08-30', valid_coverage_fraction: 0.9, min_valid_coverage_fraction_guard: 0.5},
    statistics: {
      valid_observation_count: 2400,
      valid_area_m2: 240000,
      ndvi_min: -0.1,
      ndvi_max: 0.8,
      ndvi_mean: 0.45,
      ndvi_median: 0.46,
      ndvi_p05: 0.1,
      ndvi_p95: 0.75,
      masked_fraction: 0.1,
      rejection_counts: {masked_class: 30, missing_data: 5, non_positive_denominator: 0, out_of_range: 0}
    },
    scenes_evaluated: [],
    provenance: null,
    baseline: {
      contract_version: '0.2.0',
      collection: 'sentinel-2-l2a',
      offset_rule: 'boa_offset_applied',
      mask_policy_version: 'scl-m1-v1',
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      pipeline_version: 'm3-pipeline-test'
    },
    artifacts: [],
    limitations: [],
    m2: {
      method_version: 'aq-m2-test',
      pipeline_version: 'm3-pipeline-test',
      config_version: 'm2-config-test',
      zones: [
        {zone_id: `Z-1${zoneSuffix}`, geometry: stripClassTest(0), geometry_version: '3', geometry_hash: 'fixture-zone-hash', area_m2: 270000},
        {zone_id: `Z-2${zoneSuffix}`, geometry: stripClassTest(1), geometry_version: '3', geometry_hash: 'fixture-zone-hash-2', area_m2: 270000},
        {zone_id: `Z-3${zoneSuffix}`, geometry: stripClassTest(2), geometry_version: '3', geometry_hash: 'fixture-zone-hash-3', area_m2: 270000},
        {zone_id: `Z-4${zoneSuffix}`, geometry: stripClassTest(3), geometry_version: '3', geometry_hash: 'fixture-zone-hash-4', area_m2: 270000}
      ],
      observations: [
        {zone_id: `Z-1${zoneSuffix}`, indicator: 'NDVI', window_start: '2026-08-01', window_end: '2026-08-10', observation_class: 'OBSERVED', valid_count: 120, value: 0.42, unit: 'index', valid_area_fraction: 0.92},
        {zone_id: `Z-1${zoneSuffix}`, indicator: 'NDVI', window_start: '2026-08-11', window_end: '2026-08-20', observation_class: 'DERIVED', valid_count: 90, value: 0.38, unit: 'index', valid_area_fraction: 0.8},
        {zone_id: `Z-1${zoneSuffix}`, indicator: 'NDVI', window_start: '2026-08-21', window_end: '2026-08-30', observation_class: 'MISSING', valid_count: 0, value: null, missing_reason: 'NO_OBSERVATION_IN_WINDOW'},
        {zone_id: `Z-1${zoneSuffix}`, indicator: 'RAINFALL', window_start: '2026-08-01', window_end: '2026-08-30', observation_class: 'OBSERVED', valid_count: 30, value: 4.2, unit: 'mm'},
        {zone_id: `Z-3${zoneSuffix}`, indicator: 'NDVI', window_start: '2026-08-01', window_end: '2026-08-10', observation_class: 'OBSERVED', valid_count: 60, value: 0.5, unit: 'index', valid_area_fraction: 0.7}
      ],
      source_manifest: [
        {source_id: 'sentinel2_l2a_earth_search', role: 'zone_measurement', status: 'READ', product: 'sentinel-2-l2a'},
        {source_id: 'chirps', role: 'context', status: 'READ', product: 'chirps-daily'}
      ],
      coverage: [],
      baseline: {status: 'AVAILABLE', method: 'seasonal-median', reference_start: '2024-08-01', reference_end: '2025-08-30'}
    },
    scoring: {
      method_version: 'aq-scorecard-1',
      operationalization_version: 'aq-scorecard-1-op1',
      scorecard_source_sha256: '457093d9b38347d4d0102bc29fea47ce4376c7a74c2cd0a7315096d1566b468b',
      computed_at: '2026-10-03T00:00:00Z',
      ranked_count: 2,
      unranked_count: 2,
      priority_class_status: 'NOT_ESTABLISHED'
    },
    assessment: [
      {
        zone_id: `Z-1${zoneSuffix}`,
        geometry_version: 3,
        geometry_hash: 'fixture-zone-hash',
        evidence_status: 'SUFFICIENT',
        sufficiency: {status: 'PASS', failed_factors: [], reasons: []},
        evidence_quality: {
          m: '0.8500',
          o: '0.7750',
          c: '0.8125',
          class: 'HIGH',
          display: '0.81',
          display_decimals: 2,
          label_code: 'EVIDENCE_QUALITY_UNCALIBRATED',
          factors: factorRows(),
          top_reasons: [
            {code: 'FACTOR_NOT_ASSESSED', params: {factor_id: 'O4'}},
            {code: 'FACTOR_NOT_APPLICABLE', params: {factor_id: 'O6'}},
            {code: 'PROVISIONAL_AOI', params: {}}
          ]
        },
        priority: {
          status: 'RANKED',
          rank: 1,
          rank_group: 1,
          rank_key: {independent_family_count: 2, persistence_windows: 3, recurrence_windows: 3, anomaly_strength: '0.4210', zone_id: `Z-1${zoneSuffix}`},
          reasons: [
            {code: 'INDEPENDENT_SUPPORT', params: {family_count: 2, families: ['OPTICAL', 'RAINFALL']}},
            {code: 'PERSISTENT_ANOMALY', params: {windows: 3, start: '2026-08-01', end: '2026-08-30'}},
            {code: 'PRIORITY_CLASS_NOT_ESTABLISHED', params: {method_version: 'aq-scorecard-1'}},
            {code: 'TIED_RANK', params: {rank_group: 1, tied_count: 1}}
          ]
        },
        confounders: [
          {code: 'GROWTH_STAGE', assessed: false},
          {code: 'WEATHER', assessed: true, params: {}},
          {code: 'SALINITY', assessed: false}
        ],
        independent_families: [
          {family: 'OPTICAL', source_ids: ['sentinel2_l2a_earth_search', 'landsat_c2'], eligible: true, adverse_signal: true, counted: true, reason: {code: 'SAME_FAMILY_NOT_INDEPENDENT', params: {source_ids: ['sentinel2_l2a_earth_search', 'landsat_c2']}}},
          {family: 'RAINFALL', source_ids: ['chirps'], eligible: true, adverse_signal: true, counted: true, reason: null},
          {family: 'SAR', source_ids: ['sentinel1_rtc'], eligible: false, adverse_signal: false, counted: false, reason: {code: 'CONTEXT_ONLY_SOURCE', params: {source_id: 'sentinel1_rtc'}}}
        ],
        evidence_refs: [
          {source_id: 'sentinel2_l2a_earth_search', family: 'OPTICAL', product: 'sentinel-2-l2a', revision: '05.11', dates: ['2026-08-30']}
        ]
      },
      {
        zone_id: `Z-2${zoneSuffix}`,
        geometry_version: 3,
        geometry_hash: 'fixture-zone-hash-2',
        evidence_status: 'INSUFFICIENT',
        sufficiency: {status: 'INSUFFICIENT DATA', failed_factors: ['M2'], reasons: []},
        evidence_quality: {factors: [], label_code: 'EVIDENCE_QUALITY_UNCALIBRATED', top_reasons: null},
        priority: {status: 'UNRANKED', reasons: [{code: 'MANDATORY_INPUT_MISSING', params: {source_id: 'chirps'}}]},
        confounders: [],
        independent_families: [],
        evidence_refs: []
      },
      {
        zone_id: `Z-3${zoneSuffix}`,
        geometry_version: 3,
        geometry_hash: 'fixture-zone-hash-3',
        evidence_status: 'LIMITED',
        sufficiency: {status: 'PASS', failed_factors: [], reasons: []},
        evidence_quality: {m: '0.5000', o: '0.2500', c: '0.3750', class: 'LOW', display: '0.38', display_decimals: 2, label_code: 'EVIDENCE_QUALITY_UNCALIBRATED', factors: factorRows().slice(0, 4), top_reasons: [{code: 'NO_INDEPENDENT_CORROBORATION', params: {}}]},
        priority: {
          status: 'RANKED',
          rank: 2,
          rank_group: 2,
          rank_key: {independent_family_count: 1, persistence_windows: 2, recurrence_windows: 2, anomaly_strength: '0.2000', zone_id: `Z-3${zoneSuffix}`},
          reasons: [{code: 'PERSISTENT_ANOMALY', params: {windows: 2, start: '2026-08-01', end: '2026-08-20'}}]
        },
        confounders: [],
        independent_families: [{family: 'OPTICAL', source_ids: ['sentinel2_l2a_earth_search'], eligible: true, adverse_signal: true, counted: true, reason: null}],
        evidence_refs: []
      },
      {
        zone_id: `Z-4${zoneSuffix}`,
        geometry_version: 3,
        geometry_hash: 'fixture-zone-hash-4',
        evidence_status: 'NOT_ASSESSED',
        sufficiency: {status: 'INSUFFICIENT DATA', failed_factors: [], reasons: []},
        evidence_quality: {factors: [], label_code: 'EVIDENCE_QUALITY_UNCALIBRATED', top_reasons: null},
        priority: {status: 'UNRANKED', reasons: [{code: 'FUTURE_CODE_X', params: {}}]},
        confounders: [{code: 'FUTURE_CONFOUNDER_Y', assessed: false}],
        independent_families: [],
        evidence_refs: []
      }
    ]
  };
  body.result_identity = {
    analysis_id: id,
    attempt_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    result_sha256: fixtureResultSha256(body)
  };
  return body;
}

// A SUCCEEDED result computed under aq-scorecard-1 whose zone never passed the scoring gates,
// so the backend emitted no scoring envelope at all (DR-M3-01 §4 all-or-nothing): no `scoring`,
// no `assessment`, no `result_identity`. The client must render this as "not scored under this
// method", never as UNRANKED.
function m3NotScoredResultFixture(id: string): Record<string, unknown> {
  return {
    analysis_id: id,
    schema_version: '1',
    pipeline_version: 'm3-pipeline-test',
    method_version: 'ndvi-test',
    execution_status: 'SUCCEEDED',
    evidence_status: 'LIMITED',
    request: {
      aoi_geojson: {type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]]},
      start_date: '2026-08-01',
      end_date: '2026-08-30',
      locale: 'en'
    },
    effective_coverage: {acquisition_date: '2026-08-30', valid_coverage_fraction: 0.4, min_valid_coverage_fraction_guard: 0.5},
    statistics: null,
    scenes_evaluated: [],
    provenance: null,
    baseline: {
      contract_version: '0.2.0',
      collection: 'sentinel-2-l2a',
      offset_rule: 'boa_offset_applied',
      mask_policy_version: 'scl-m1-v1',
      grid_crs: 'EPSG:32638',
      grid_resolution_m: 10,
      pipeline_version: 'm3-pipeline-test'
    },
    artifacts: [],
    limitations: [
      {code: 'EVIDENCE_LIMITED', params: {cause_code: 'LIMITED'}}
    ]
  };
}

// Three saved analyses (two pages of two): newest first. One scored, one pre-M3 (no counts), one
// scored again so "load more" has a second page to fetch.
function historyItems(): Record<string, unknown>[] {
  const scoredHash = fixtureResultSha256(m3ScoredResultFixture(M3_SCORED_ID));
  return [
    {analysis_id: M3_SCORED_ID, aoi_sha256: 'a'.repeat(64), created_at: '2026-10-03T08:00:00Z', start_date: '2026-08-01', end_date: '2026-08-30', execution_status: 'SUCCEEDED', evidence_status: 'SUFFICIENT', method_version: 'aq-scorecard-1', ranked_count: 2, unranked_count: 2, result_sha256: scoredHash},
    {analysis_id: M3_NOT_SCORED_ID, aoi_sha256: 'b'.repeat(64), created_at: '2026-10-02T08:00:00Z', start_date: '2026-07-01', end_date: '2026-07-30', execution_status: 'SUCCEEDED', evidence_status: 'LIMITED', method_version: 'aq-scorecard-1'},
    {analysis_id: M3_SLOW_ID, aoi_sha256: 'c'.repeat(64), created_at: '2026-10-01T08:00:00Z', start_date: '2026-06-01', end_date: '2026-06-30', execution_status: 'SUCCEEDED', evidence_status: 'SUFFICIENT', method_version: 'aq-scorecard-1', ranked_count: 2, unranked_count: 2, result_sha256: fixtureResultSha256(m3ScoredResultFixture(M3_SLOW_ID, 'slow'))}
  ];
}

function errorEnvelope(code: string, params: Record<string, unknown> = {}, requestId = 'req-fixture-1'): Record<string, unknown> {
  return {error: {code, params, request_id: requestId}};
}

// Lowercase, matching the pinned backend's real published value
// (work/backend/src/aqualedger/config.py SOURCE_REGISTRY: `temporal_or_static="temporal"`), not
// the 'TEMPORAL' this fixture used to carry — that mismatch is what let A41 (a false "Static" role
// label on the mandatory temporal source) go undetected.
const defaultSources = {
  sources: [{
    source_id: 'sentinel2_l2a_earth_search',
    name: 'Sentinel-2 L2A',
    provider: 'Earth Search',
    collection: 'sentinel-2-l2a',
    temporal_or_static: 'temporal',
    mandatory: true,
    configured: true,
    enabled: true,
    check: {status: 'NOT_CHECKED', checked_at: null, check_scope: null, reason_code: null, reason_params: {}}
  }]
};

// A value the web catalogue does not recognize as either role, so the settings screen's fallback
// (rather than a silently false "Static" label) is exercised too.
const unknownRoleSources = {
  sources: [{
    ...defaultSources.sources[0],
    temporal_or_static: 'archival'
  }]
};

export function startBackendDouble(
  port: number,
  options: {previewFixtureBytes?: Buffer} = {}
): Promise<import('node:http').Server> {
  // Callers resolve and read the fixture file themselves (each from a context where a
  // module-relative path is safe — see tests/fixtures/run-backend-double.mjs) so this module never
  // contains `import.meta`, which would be a syntax error when Playwright's config loader
  // transitively requires this file as CommonJS to read its exported string constants.
  const previewFixtureBytes = options.previewFixtureBytes ?? Buffer.alloc(0);
  const requests: LoggedRequest[] = [];
  // Any id not otherwise special-cased below (FAILED_ID, RESULT_NOT_FOUND_ID, or one of the
  // immediate-result ids) returns NOT_READY exactly once at /result, then the canned success
  // result — keyed per id (not a single flag) so concurrent Playwright projects minting their own
  // fresh scenario id never race each other on this shared, long-lived double.
  const notReadyServedIds = new Set<string>();
  // Mutable only for the /sources scenario tests, which run in a serial describe block to avoid
  // cross-test races on this shared, long-lived double.
  let sourcesMode: 'default' | 'empty' | 'outage' | 'unknownRole' = 'default';
  let historyMode: 'default' | 'empty' | 'error' | 'unauthorized' = 'default';

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString('utf8');

    if (url.pathname === '/__test__/requests') {
      respondJson(res, 200, requests);
      return;
    }
    if (url.pathname === '/__test__/reset' && req.method === 'POST') {
      requests.length = 0;
      notReadyServedIds.clear();
      sourcesMode = 'default';
      historyMode = 'default';
      respondJson(res, 200, {ok: true});
      return;
    }
    if (url.pathname === '/__test__/set-sources-mode' && req.method === 'POST') {
      const body = rawBody ? (JSON.parse(rawBody) as {mode?: 'default' | 'empty' | 'outage' | 'unknownRole'}) : {};
      sourcesMode = body.mode ?? 'default';
      respondJson(res, 200, {ok: true, sourcesMode});
      return;
    }
    if (url.pathname === '/__test__/set-history-mode' && req.method === 'POST') {
      const body = rawBody ? (JSON.parse(rawBody) as {mode?: 'default' | 'empty' | 'error' | 'unauthorized'}) : {};
      historyMode = body.mode ?? 'default';
      respondJson(res, 200, {ok: true, historyMode});
      return;
    }
    if (url.pathname === '/__test__/preview-bytes' && req.method === 'GET') {
      res.writeHead(200, {'Content-Type': 'image/tiff', 'Content-Length': previewFixtureBytes.length});
      res.end(previewFixtureBytes);
      return;
    }

    const authorization = req.headers.authorization ?? null;
    const parsedBody = rawBody ? (JSON.parse(rawBody) as JsonValue) : null;
    requests.push({
      method: req.method,
      path: url.pathname,
      hasAuthorization: authorization !== null,
      authorization,
      idempotencyKey: (req.headers['idempotency-key'] as string | undefined) ?? null,
      body: parsedBody
    });

    if (req.method === 'GET' && url.pathname === '/analyses') {
      if (historyMode === 'unauthorized') {
        respondJson(res, 401, errorEnvelope('UNAUTHENTICATED'));
        return;
      }
      if (historyMode === 'error') {
        respondJson(res, 503, errorEnvelope('SOURCE_UNAVAILABLE'));
        return;
      }
      const all = historyMode === 'empty' ? [] : historyItems();
      const cursor = url.searchParams.get('cursor');
      const pageSize = 2;
      const start = cursor === 'page-2' ? pageSize : 0;
      const items = all.slice(start, start + pageSize);
      const next = start + pageSize < all.length ? 'page-2' : null;
      respondJson(res, 200, {items, next_cursor: next});
      return;
    }

    if (req.method === 'POST' && url.pathname === '/analyses') {
      const body = (parsedBody ?? {}) as Record<string, unknown>;
      if (body.start_date === CONFLICT_START_DATE) {
        respondJson(res, 409, errorEnvelope('IDEMPOTENCY_CONFLICT', {idempotency_key: req.headers['idempotency-key'] ?? null}));
        return;
      }
      respondJson(res, 202, {analysis_id: SUCCEEDED_ID, status_url: `/analyses/${SUCCEEDED_ID}`});
      return;
    }

    const statusMatch = url.pathname.match(/^\/analyses\/([^/]+)$/);
    if (req.method === 'GET' && statusMatch) {
      const id = statusMatch[1] as string;
      if (id === FAILED_ID) {
        respondJson(res, 200, statusFixture(id, 'FAILED'));
        return;
      }
      if (id === FAILED_WRONG_PATH_CODE_ID) {
        respondJson(res, 200, statusFixture(id, 'FAILED', undefined, 'LOW_VALID_COVERAGE'));
        return;
      }
      if (id === QUEUED_ID) {
        respondJson(res, 200, statusFixture(id, 'QUEUED', 'NOT_ASSESSED'));
        return;
      }
      respondJson(res, 200, statusFixture(id, 'SUCCEEDED', 'NOT_ASSESSED'));
      return;
    }

    const resultMatch = url.pathname.match(/^\/analyses\/([^/]+)\/result$/);
    if (req.method === 'GET' && resultMatch) {
      const id = resultMatch[1] as string;
      // Mirrors the real backend exactly (analyses.py `get_analysis_result`): a FAILED run is
      // uncommitted, so it answers the same frozen 200 NOT_READY envelope as any other uncommitted
      // run, carrying execution_status so the caller can tell "failed" from "still running" — never
      // a fabricated non-200.
      if (id === FAILED_ID || id === FAILED_WRONG_PATH_CODE_ID) {
        respondJson(res, 200, errorEnvelope('NOT_READY', {execution_status: 'FAILED'}));
        return;
      }
      // Mirrors the real backend's genuine 404 NOT_FOUND (analyses.py: `if row is None: raise
      // AppError(ErrorCode.NOT_FOUND, ...)`) — a real non-200 result-fetch failure, distinct from
      // the frozen 200 NOT_READY envelope above.
      if (id === RESULT_NOT_FOUND_ID) {
        respondJson(res, 404, errorEnvelope('NOT_FOUND', {resource: 'analysis'}));
        return;
      }
      const immediateResultIds = new Set([
        SUCCEEDED_ID,
        PREVIEW_READY_ID,
        NO_ARTIFACT_ID,
        ARTIFACT_NOT_READY_ID,
        ARTIFACT_URL_UNAVAILABLE_ID,
        NO_SCENES_FOUND_ID,
        NO_ELIGIBLE_ACQUISITION_ID,
        NO_ELIGIBLE_ACQUISITION_UNDEFINED_COVERAGE_ID,
        NO_VALID_PIXEL_ID,
        M3_SCORED_ID,
        M3_SLOW_ID,
        M3_NOT_SCORED_ID
      ]);
      if (!immediateResultIds.has(id) && !notReadyServedIds.has(id)) {
        notReadyServedIds.add(id);
        respondJson(res, 200, errorEnvelope('NOT_READY', {execution_status: 'RUNNING'}));
        return;
      }
      if (id === NO_SCENES_FOUND_ID) {
        respondJson(res, 200, insufficientResultFixture(id, [], [{code: 'NO_SCENES_FOUND', params: {}}]));
        return;
      }
      if (id === NO_ELIGIBLE_ACQUISITION_ID) {
        // Below-guard cause: a mosaic was built (coverage defined) but rejected for falling short
        // of the guard — pipeline.py:230-244's `LOW_VALID_COVERAGE` branch.
        respondJson(res, 200, insufficientResultFixture(
          id,
          [{
            acquisition_date: '2026-08-15',
            valid_coverage_fraction: 0.2,
            selected: false,
            item_ids: ['Sentinel-2 item D'],
            rejection_reason: 'LOW_VALID_COVERAGE',
            data_present_overlap_count: 1000,
            masked_yielded_coverage_count: 200,
            discarded_candidates: [],
            failures: []
          }],
          [{code: 'NO_ELIGIBLE_ACQUISITION', params: {}}, {code: 'EFFECTIVE_QUALITY_RESOLUTION_20M', params: {}}]
        ));
        return;
      }
      if (id === NO_ELIGIBLE_ACQUISITION_UNDEFINED_COVERAGE_ID) {
        // Undefined-coverage cause: every evaluated date was rejected before a mosaic was ever
        // built, so coverage was never computed — pipeline.py:165-195's `TOO_MANY_TILES_FOR_DATE`
        // and `BOA_OFFSET_NOT_ASSERTED` branches. No `EFFECTIVE_QUALITY_RESOLUTION_20M` here.
        respondJson(res, 200, insufficientResultFixture(
          id,
          [{
            acquisition_date: '2026-08-10',
            valid_coverage_fraction: null,
            selected: false,
            item_ids: ['Sentinel-2 item E'],
            rejection_reason: 'TOO_MANY_TILES_FOR_DATE',
            data_present_overlap_count: null,
            masked_yielded_coverage_count: null,
            discarded_candidates: [],
            failures: []
          }, {
            acquisition_date: '2026-08-05',
            valid_coverage_fraction: null,
            selected: false,
            item_ids: ['Sentinel-2 item F'],
            rejection_reason: 'BOA_OFFSET_NOT_ASSERTED',
            data_present_overlap_count: null,
            masked_yielded_coverage_count: null,
            discarded_candidates: [],
            failures: []
          }],
          [{code: 'NO_ELIGIBLE_ACQUISITION', params: {}}]
        ));
        return;
      }
      if (id === NO_VALID_PIXEL_ID) {
        respondJson(res, 200, noValidPixelResultFixture(id));
        return;
      }
      if (id === M3_SCORED_ID) {
        respondJson(res, 200, m3ScoredResultFixture(id));
        return;
      }
      if (id === M3_SLOW_ID) {
        setTimeout(() => respondJson(res, 200, m3ScoredResultFixture(id, 'slow')), M3_SLOW_DELAY_MS);
        return;
      }
      if (id === M3_NOT_SCORED_ID) {
        respondJson(res, 200, m3NotScoredResultFixture(id));
        return;
      }
      if (id === NO_ARTIFACT_ID) {
        const fixture = resultFixture(id);
        fixture.artifacts = [];
        respondJson(res, 200, fixture);
        return;
      }
      if (id === ARTIFACT_NOT_READY_ID) {
        const fixture = resultFixture(id);
        const existingArtifact = (fixture.artifacts as Record<string, unknown>[] | undefined)?.[0] ?? {};
        fixture.artifacts = [{...existingArtifact, ready: false, preview_url: null}];
        respondJson(res, 200, fixture);
        return;
      }
      if (id === ARTIFACT_URL_UNAVAILABLE_ID) {
        const fixture = resultFixture(id);
        const existingArtifact = (fixture.artifacts as Record<string, unknown>[] | undefined)?.[0] ?? {};
        fixture.artifacts = [{...existingArtifact, ready: true, preview_url: null}];
        respondJson(res, 200, fixture);
        return;
      }
      const previewUrl = id === PREVIEW_READY_ID ? `http://127.0.0.1:${port}/__test__/preview-bytes` : undefined;
      respondJson(res, 200, previewUrl ? resultFixture(id, previewUrl) : resultFixture(id));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sources') {
      if (sourcesMode === 'outage') {
        req.socket.destroy();
        return;
      }
      const sourcesBody = sourcesMode === 'empty'
        ? {sources: []}
        : sourcesMode === 'unknownRole'
          ? unknownRoleSources
          : defaultSources;
      respondJson(res, 200, sourcesBody);
      return;
    }

    respondJson(res, 404, errorEnvelope('NOT_FOUND'));
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text)});
  res.end(text);
}
