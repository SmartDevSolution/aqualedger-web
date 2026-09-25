import type english from '../../../messages/en.json';

export type ErrorMessageKey = keyof typeof english.errors;

const backendErrors = new Set<ErrorMessageKey>([
  'INPUT_INVALID', 'LIMIT_EXCEEDED', 'NOT_READY', 'SOURCE_UNAVAILABLE', 'PROCESSING_FAILED',
  'IDEMPOTENCY_CONFLICT', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'API_NOT_CONFIGURED',
  'IDEMPOTENCY_KEY_UNAVAILABLE', 'NETWORK_ERROR', 'HTTP_ERROR', 'UNKNOWN_RESPONSE'
]);

const reasonMessages = new Set<ErrorMessageKey>([
  'NO_ELIGIBLE_ACQUISITION', 'NO_SCENES_FOUND', 'NO_DATE_MEETS_MIN_VALID_COVERAGE',
  'LOW_VALID_COVERAGE', 'SOURCE_READ_FAILED', 'NO_VALID_CANDIDATE', 'TOO_MANY_TILES_FOR_DATE',
  'BOA_OFFSET_NOT_ASSERTED', 'NDVI_OUT_OF_RANGE_PIXELS_REJECTED'
]);

const sourceReasonMessages = new Set<ErrorMessageKey>(['UNREACHABLE', 'UNEXPECTED_STATUS']);

// The pinned contract has no separate enum for `limitations[].code`; it is a free-form object
// (see contracts/openapi.json AnalysisResult.limitations). The A17 hosted acceptance run (Council
// finding F1) established that the backend reuses the same acquisition/coverage reason vocabulary
// documented in `reasonMessages` (docs/CONTRACT-RECONCILIATION.md items 5-6) as top-level result
// limitations, not only as per-scene `rejection_reason` values — it published `NO_SCENES_FOUND`
// and `NO_ELIGIBLE_ACQUISITION` as limitations. Rather than special-casing exactly those two
// observed codes, this recognizes the whole shared reason vocabulary plus the
// resolution-degradation limitation this catalogue already ships, and keeps
// `unknownBackendLimitation` for anything outside it.
const limitationMessages = new Set<ErrorMessageKey>(['EFFECTIVE_QUALITY_RESOLUTION_20M', ...reasonMessages]);

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
