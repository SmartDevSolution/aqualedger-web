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
export const CONFLICT_START_DATE = '2001-01-01';

type JsonValue = Record<string, unknown> | unknown[];

type LoggedRequest = {
  method: string | undefined;
  path: string;
  hasAuthorization: boolean;
  authorization: string | null;
  idempotencyKey: string | null;
  body: JsonValue | null;
};

function statusFixture(id: string, executionStatus: string, evidenceStatus?: string): Record<string, unknown> {
  const base = {
    analysis_id: id,
    execution_status: executionStatus,
    start_date: '2026-08-01',
    end_date: '2026-08-30',
    created_at: '2026-09-24T12:00:00Z',
    updated_at: '2026-09-24T12:01:00Z',
    warnings: [],
    errors: executionStatus === 'FAILED' ? [{code: 'SOURCE_READ_FAILED', params: {band: 'nir'}}] : []
  };
  return executionStatus === 'FAILED' ? base : {...base, evidence_status: evidenceStatus};
}

function resultFixture(id: string): Record<string, unknown> {
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
      crs: 'EPSG:32638',
      bounds: {minx: 100, miny: 200, maxx: 300, maxy: 400},
      ready: true,
      preview_url: 'https://private.invalid/signed'
    }],
    limitations: []
  };
}

function errorEnvelope(code: string, params: Record<string, unknown> = {}, requestId = 'req-fixture-1'): Record<string, unknown> {
  return {error: {code, params, request_id: requestId}};
}

const defaultSources = {
  sources: [{
    source_id: 'sentinel2_l2a_earth_search',
    name: 'Sentinel-2 L2A',
    provider: 'Earth Search',
    collection: 'sentinel-2-l2a',
    temporal_or_static: 'TEMPORAL',
    mandatory: true,
    configured: true,
    enabled: true,
    check: {status: 'NOT_CHECKED', checked_at: null, check_scope: null, reason_code: null, reason_params: {}}
  }]
};

export function startBackendDouble(port: number): Promise<import('node:http').Server> {
  const requests: LoggedRequest[] = [];
  // Any id other than SUCCEEDED_ID/FAILED_ID returns NOT_READY exactly once at /result, then the
  // canned success result — keyed per id (not a single flag) so concurrent Playwright projects
  // minting their own fresh scenario id never race each other on this shared, long-lived double.
  const notReadyServedIds = new Set<string>();
  // Mutable only for the /sources scenario tests, which run in a serial describe block to avoid
  // cross-test races on this shared, long-lived double.
  let sourcesMode: 'default' | 'empty' | 'outage' = 'default';

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
      respondJson(res, 200, {ok: true});
      return;
    }
    if (url.pathname === '/__test__/set-sources-mode' && req.method === 'POST') {
      const body = rawBody ? (JSON.parse(rawBody) as {mode?: 'default' | 'empty' | 'outage'}) : {};
      sourcesMode = body.mode ?? 'default';
      respondJson(res, 200, {ok: true, sourcesMode});
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
      if (id === FAILED_ID) {
        respondJson(res, 500, errorEnvelope('PROCESSING_FAILED'));
        return;
      }
      if (id !== SUCCEEDED_ID && !notReadyServedIds.has(id)) {
        notReadyServedIds.add(id);
        respondJson(res, 200, errorEnvelope('NOT_READY', {execution_status: 'RUNNING'}));
        return;
      }
      respondJson(res, 200, resultFixture(id));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/sources') {
      if (sourcesMode === 'outage') {
        req.socket.destroy();
        return;
      }
      respondJson(res, 200, sourcesMode === 'empty' ? {sources: []} : defaultSources);
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
