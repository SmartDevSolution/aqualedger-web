import type english from '../../../messages/en.json';

export type ErrorMessageKey = keyof typeof english.errors;

const backendErrors = new Set<ErrorMessageKey>([
  'INPUT_INVALID', 'LIMIT_EXCEEDED', 'NOT_READY', 'SOURCE_UNAVAILABLE', 'PROCESSING_FAILED',
  'IDEMPOTENCY_CONFLICT', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'API_NOT_CONFIGURED',
  'IDEMPOTENCY_KEY_UNAVAILABLE', 'NETWORK_ERROR', 'HTTP_ERROR', 'UNKNOWN_RESPONSE'
]);

// Per-date `SceneSelection.rejection_reason` and the run-level `AnalysisStatusResponse.errors[].code`
// carve-out share this vocabulary (work/backend/src/aqualedger/analysis/pipeline.py's
// `rejection_reason` assignments in `run_analysis`, and `worker/runner.py::_run_job`'s
// `SOURCE_READ_FAILED` carve-out). It is a different vocabulary from the top-level
// `limitations[].code` set below — the backend never reuses these per-date reason codes as a
// top-level limitation.
const reasonMessages = new Set<ErrorMessageKey>([
  'NO_ELIGIBLE_ACQUISITION', 'NO_SCENES_FOUND', 'NO_DATE_MEETS_MIN_VALID_COVERAGE',
  'LOW_VALID_COVERAGE', 'SOURCE_READ_FAILED', 'NO_VALID_CANDIDATE', 'TOO_MANY_TILES_FOR_DATE',
  'BOA_OFFSET_NOT_ASSERTED', 'NDVI_OUT_OF_RANGE_PIXELS_REJECTED'
]);

const sourceReasonMessages = new Set<ErrorMessageKey>(['UNREACHABLE', 'UNEXPECTED_STATUS']);

// The pinned contract has no separate enum for `limitations[].code`; it is a free-form object
// (see contracts/openapi.json AnalysisResult.limitations). Enumerated directly from every place
// the pinned backend actually constructs a top-level limitation
// (work/backend/src/aqualedger/analysis/pipeline.py: `_effective_quality_limitation` and the four
// literal `{"code": ...}` limitation entries in `run_analysis`, lines ~51, 126, 300, 342, 346) —
// deliberately NOT derived from `reasonMessages` above, which is the per-date/run-failure reason
// vocabulary. The backend never publishes a per-date reason (e.g. `LOW_VALID_COVERAGE`,
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

export function reasonMessageKey(code: string | null): ErrorMessageKey {
  return code && reasonMessages.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownBackendReason';
}

export function limitationMessageKey(code: string | null): ErrorMessageKey {
  return code && limitationMessages.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownBackendLimitation';
}

export function sourceReasonMessageKey(code: string | null): ErrorMessageKey {
  return code && sourceReasonMessages.has(code as ErrorMessageKey) ? code as ErrorMessageKey : 'unknownSourceReason';
}
