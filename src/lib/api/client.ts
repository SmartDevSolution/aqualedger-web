import type {components} from './generated';

export type AnalysisCreateRequest = components['schemas']['AnalysisCreateRequest'];
export type AnalysisCreateResponse = components['schemas']['AnalysisCreateResponse'];
type GeneratedAnalysisStatus = components['schemas']['AnalysisStatusResponse'];
export type AnalysisStatus =
  | (Omit<GeneratedAnalysisStatus, 'execution_status' | 'evidence_status'> & {
      execution_status: Exclude<GeneratedAnalysisStatus['execution_status'], 'FAILED'>;
      evidence_status: GeneratedAnalysisStatus['evidence_status'];
    })
  | (Omit<GeneratedAnalysisStatus, 'execution_status' | 'evidence_status'> & {
      execution_status: 'FAILED';
      evidence_status?: never;
    });
export type AnalysisResult = components['schemas']['AnalysisResult'];
export type SourcesResponse = components['schemas']['SourcesResponse'];

export type ApiFailure = {
  code: string;
  requestId: string | null;
  httpStatus: number | null;
  retryable: boolean;
};

export type ApiResult<T> =
  | {data: T; error: null}
  | {data: null; error: ApiFailure};

export function hasBackendUrl(): boolean {
  return getBackendBaseUrl() !== null;
}

export function createAnalysis(
  body: AnalysisCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ApiResult<AnalysisCreateResponse>> {
  return request('/analyses', {
    method: 'POST',
    headers: {'Idempotency-Key': idempotencyKey},
    body: JSON.stringify(body),
    ...(signal ? {signal} : {})
  }, isCreateResponse);
}

export function getAnalysisStatus(
  analysisId: string,
  signal?: AbortSignal
): Promise<ApiResult<AnalysisStatus>> {
  return request(`/analyses/${encodeURIComponent(analysisId)}`, {method: 'GET', ...(signal ? {signal} : {})}, (value): value is AnalysisStatus =>
    isAnalysisStatus(value) && value.analysis_id === analysisId);
}

export function getAnalysisResult(
  analysisId: string,
  signal?: AbortSignal
): Promise<ApiResult<AnalysisResult>> {
  return request(`/analyses/${encodeURIComponent(analysisId)}/result`, {method: 'GET', ...(signal ? {signal} : {})}, (value): value is AnalysisResult =>
    isAnalysisResult(value) && value.analysis_id === analysisId);
}

export function getSources(signal?: AbortSignal): Promise<ApiResult<SourcesResponse>> {
  return request('/sources', {method: 'GET', ...(signal ? {signal} : {})}, isSourcesResponse);
}

async function request<T>(
  path: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal | undefined;
  },
  validate: (value: unknown) => value is T
): Promise<ApiResult<T>> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return failed('API_NOT_CONFIGURED', null, null, false);
  }

  const headers = new Headers({Accept: 'application/json', ...options.headers});
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abortFromCaller, {once: true});
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);

  try {
    const init: RequestInit = {method: options.method, headers, cache: 'no-store', signal: controller.signal};
    if (options.body) init.body = options.body;
    const response = await fetch(new URL(path.replace(/^\/+/, ''), `${baseUrl}/`), init);
    const payload: unknown = await response.json().catch(() => null);
    const envelope = readErrorEnvelope(payload);
    if (envelope) {
      return {data: null, error: {
        code: envelope.code,
        requestId: envelope.requestId,
        httpStatus: response.status,
        retryable: response.status >= 500 || response.status === 429
      }};
    }
    if (!response.ok) {
      return failed(response.status === 422 ? 'INPUT_INVALID' : 'HTTP_ERROR', response.status, null, response.status >= 500 || response.status === 429);
    }
    if (!validate(payload)) {
      return failed('UNKNOWN_RESPONSE', response.status, null, false);
    }
    return {data: payload, error: null};
  } catch {
    if (!timedOut && options.signal?.aborted) {
      return failed('REQUEST_CANCELLED', null, null, false);
    }
    return failed('NETWORK_ERROR', null, null, true);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

function getBackendBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_AQUALEDGER_API_BASE_URL?.trim();
  if (!configured) {
    return null;
  }
  try {
    const parsed = new URL(configured);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function readErrorEnvelope(value: unknown): {code: string; requestId: string | null} | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null;
  }
  const error = value.error;
  if (typeof error.code !== 'string' || !isRecord(error.params)) {
    return null;
  }
  return {
    code: error.code,
    requestId: typeof error.request_id === 'string' ? error.request_id : null
  };
}

function failed(code: string, httpStatus: number | null, requestId: string | null, retryable: boolean): ApiResult<never> {
  return {data: null, error: {code, httpStatus, requestId, retryable}};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCreateResponse(value: unknown): value is AnalysisCreateResponse {
  return isRecord(value) && isUuid(value.analysis_id) && typeof value.status_url === 'string';
}

function isAnalysisStatus(value: unknown): value is AnalysisStatus {
  if (!isRecord(value) || !isUuid(value.analysis_id) || typeof value.execution_status !== 'string') return false;
  if (!['QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED'].includes(value.execution_status)) return false;
  if (!isIsoDate(value.start_date) || !isIsoDate(value.end_date)
    || !isIsoTimestamp(value.created_at) || !isIsoTimestamp(value.updated_at)) return false;
  if (value.errors !== undefined && (!Array.isArray(value.errors) || !value.errors.every(isRecord))) return false;
  if (value.warnings !== undefined && (!Array.isArray(value.warnings) || !value.warnings.every(isRecord))) return false;
  if (value.execution_status === 'FAILED') return !('evidence_status' in value);
  return typeof value.evidence_status === 'string'
    && ['NOT_ASSESSED', 'SUFFICIENT', 'LIMITED', 'INSUFFICIENT'].includes(value.evidence_status);
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value) || !isUuid(value.analysis_id) || typeof value.schema_version !== 'string'
    || typeof value.pipeline_version !== 'string' || typeof value.method_version !== 'string'
    || typeof value.execution_status !== 'string' || !isCreateRequest(value.request)) return false;
  if (value.execution_status !== 'SUCCEEDED') return false;
  if (typeof value.evidence_status !== 'string'
    || !['NOT_ASSESSED', 'SUFFICIENT', 'LIMITED', 'INSUFFICIENT'].includes(value.evidence_status)) return false;
  if (!isRecord(value.effective_coverage)
    || !isNullableDate(value.effective_coverage.acquisition_date)
    || !isNullableNumber(value.effective_coverage.valid_coverage_fraction)
    || typeof value.effective_coverage.min_valid_coverage_fraction_guard !== 'number') return false;
  if (value.statistics !== null && !isNdviStatistics(value.statistics)) return false;
  if (value.provenance !== null && !isProvenance(value.provenance)) return false;
  if (value.artifacts !== undefined && (!Array.isArray(value.artifacts) || !value.artifacts.every(isRecord))) return false;
  if (value.scenes_evaluated !== undefined && (!Array.isArray(value.scenes_evaluated) || !value.scenes_evaluated.every(isSceneSelection))) return false;
  if (value.limitations !== undefined && (!Array.isArray(value.limitations) || !value.limitations.every(isRecord))) return false;
  return true;
}

function isSourcesResponse(value: unknown): value is SourcesResponse {
  return isRecord(value) && Array.isArray(value.sources) && value.sources.every((source) => {
    if (!isRecord(source) || !isRecord(source.check)) return false;
    return typeof source.source_id === 'string'
      && typeof source.name === 'string'
      && typeof source.provider === 'string'
      && typeof source.collection === 'string'
      && typeof source.temporal_or_static === 'string'
      && typeof source.mandatory === 'boolean'
      && typeof source.configured === 'boolean'
      && typeof source.enabled === 'boolean'
      && typeof source.check.status === 'string'
      && ['NOT_CHECKED', 'reachable', 'failed', 'deferred', 'not_configured'].includes(source.check.status)
      && isNullableTimestamp(source.check.checked_at)
      && isNullableString(source.check.check_scope);
  });
}

function isNdviStatistics(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['valid_observation_count', 'valid_area_m2', 'ndvi_min', 'ndvi_max', 'ndvi_mean', 'ndvi_median', 'ndvi_p05', 'ndvi_p95', 'masked_fraction']
    .every((field) => typeof value[field] === 'number')
    && isRecord(value.rejection_counts);
}

function isProvenance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.source_id === 'string'
    && typeof value.provider === 'string'
    && typeof value.collection === 'string'
    && Array.isArray(value.item_ids)
    && value.item_ids.every((item) => typeof item === 'string')
    && isIsoTimestamp(value.acquisition_datetime)
    && isNullableString(value.processing_baseline)
    && typeof value.scale === 'number'
    && typeof value.offset === 'number'
    && typeof value.grid_crs === 'string'
    && typeof value.grid_resolution_m === 'number'
    && Array.isArray(value.grid_origin)
    && value.grid_origin.length === 2
    && value.grid_origin.every((coordinate) => typeof coordinate === 'number')
    && typeof value.mask_policy === 'string'
    && Array.isArray(value.mask_masked_classes)
    && value.mask_masked_classes.every((item) => typeof item === 'number')
    && Array.isArray(value.mask_retained_classes)
    && value.mask_retained_classes.every((item) => typeof item === 'number');
}

function isSceneSelection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isIsoDate(value.acquisition_date)
    && typeof value.valid_coverage_fraction === 'number'
    && typeof value.selected === 'boolean'
    && (value.rejection_reason === undefined || isNullableString(value.rejection_reason))
    && (value.item_ids === undefined || (Array.isArray(value.item_ids) && value.item_ids.every((item) => typeof item === 'string')));
}

function isCreateRequest(value: unknown): value is AnalysisCreateRequest {
  if (!isRecord(value) || !isRecord(value.aoi_geojson) || value.aoi_geojson.type !== 'Polygon'
    || !Array.isArray(value.aoi_geojson.coordinates) || !isIsoDate(value.start_date) || !isIsoDate(value.end_date)) return false;
  return value.aoi_geojson.coordinates.every((ring) => Array.isArray(ring) && ring.every((position) =>
    Array.isArray(position) && position.length >= 2 && position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}
