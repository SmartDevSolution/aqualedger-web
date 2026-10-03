import type english from '../../../messages/en.json';

export type ErrorMessageKey = keyof typeof english.errors;

const backendErrors = new Set<ErrorMessageKey>([
  'INPUT_INVALID', 'LIMIT_EXCEEDED', 'NOT_READY', 'SOURCE_UNAVAILABLE', 'PROCESSING_FAILED',
  'IDEMPOTENCY_CONFLICT', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'API_NOT_CONFIGURED',
  'IDEMPOTENCY_KEY_UNAVAILABLE', 'NETWORK_ERROR', 'HTTP_ERROR', 'UNKNOWN_RESPONSE'
]);

// Per-date `SceneSelection.rejection_reason` (the `DateEvaluation.rejection_reason` assignments in
// `run_analysis`, pipeline.py:148-261) publishes exactly these four codes: `SOURCE_READ_FAILED`
// (the failed-item-date carve-out at pipeline.py:148-160, the post-tie-break completeness check at
// 204-221, and the mosaic-build failure at 223-242), `TOO_MANY_TILES_FOR_DATE` (165-178),
// `BOA_OFFSET_NOT_ASSERTED` (183-197), and `LOW_VALID_COVERAGE` (246-261). It never assigns any
// top-level-only code (e.g. `NO_ELIGIBLE_ACQUISITION`, `NDVI_OUT_OF_RANGE_PIXELS_REJECTED`) here.
const perDateReasonMessages = new Set<ErrorMessageKey>([
  'SOURCE_READ_FAILED', 'TOO_MANY_TILES_FOR_DATE', 'BOA_OFFSET_NOT_ASSERTED', 'LOW_VALID_COVERAGE'
]);

// The run-level `AnalysisStatusResponse.errors[].code` (the stored `failure_reason_code`, read at
// backend `api/routes/analyses.py:134`) is set only by `worker/runner.py::_fail` call sites, and
// only ever carries these three codes: `SOURCE_READ_FAILED` (the pipeline's own FAILED outcome at
// pipeline.py:278-293, always this code — the same code the per-date set above also carries,
// legitimately shared across both paths, kept in both Sets here); `SOURCE_UNAVAILABLE` (an
// uncaught `AppError` escaping `run_analysis` at runner.py:84-94 as `exc.code.value` — walking
// every `AppError` raise reachable from `run_analysis`, only `analysis/stac.py`'s
// `SourceUnavailableError` (raised uncaught around the `search_items` call, e.g. stac.py:109-145)
// and the upstream-guarded `analysis/mosaic.py:176-179` can reach that line, and only the former is
// reachable in practice); and `PROCESSING_FAILED` (the unexpected-exception fallback at
// runner.py:96-99, the two artifact-storage failure sites at runner.py:135-143 and 246-266, and
// defensively `mosaic.py:176-179` via the same `exc.code.value` path). It never carries a per-date
// rejection code (e.g. `LOW_VALID_COVERAGE`, `TOO_MANY_TILES_FOR_DATE`) — none of those is ever
// assigned to `failure_reason_code`.
const runFailureMessages = new Set<ErrorMessageKey>([
  'SOURCE_READ_FAILED', 'SOURCE_UNAVAILABLE', 'PROCESSING_FAILED'
]);

const sourceReasonMessages = new Set<ErrorMessageKey>(['UNREACHABLE', 'UNEXPECTED_STATUS']);

// The pinned contract has no separate enum for `limitations[].code`; it is a free-form object
// (see contracts/openapi.json AnalysisResult.limitations). Enumerated directly from every place
// the pinned backend actually constructs a top-level limitation
// (work/backend/src/aqualedger/analysis/pipeline.py: `_effective_quality_limitation` and the four
// literal `{"code": ...}` limitation entries in `run_analysis`, lines ~51, 126, 300, 342, 346) —
// deliberately NOT derived from `perDateReasonMessages`/`runFailureMessages` above, which are the
// per-date and run-failure reason vocabularies. The backend never publishes a per-date reason (e.g. `LOW_VALID_COVERAGE`,
// `TOO_MANY_TILES_FOR_DATE`) as a top-level limitation; deriving this set from that one would have
// silently started recognizing such a code here too, reading a per-date fact as a run-wide one if
// it ever collided (independent review BLOCK point 2 on W12 F1). `unknownBackendLimitation` stays
// the fallback for anything outside this enumerated set, including a genuinely new backend code.
const limitationMessages = new Set<ErrorMessageKey>([
  'NO_SCENES_FOUND',
  'NO_ELIGIBLE_ACQUISITION',
  'EFFECTIVE_QUALITY_RESOLUTION_20M',
  'NO_VALID_PIXEL_IN_SELECTED_DATE',
  'NDVI_OUT_OF_RANGE_PIXELS_REJECTED'
]);

export function backendErrorMessageKey(code: string): ErrorMessageKey {
  return backendErrors.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownBackendError';
}

export function perDateReasonMessageKey(code: string | null): ErrorMessageKey {
  return code && perDateReasonMessages.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownBackendReason';
}

export function runFailureMessageKey(code: string | null): ErrorMessageKey {
  return code && runFailureMessages.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownBackendReason';
}

export function limitationMessageKey(code: string | null): ErrorMessageKey {
  return code && limitationMessages.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownBackendLimitation';
}

export function sourceReasonMessageKey(code: string | null): ErrorMessageKey {
  return code && sourceReasonMessages.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownSourceReason';
}
