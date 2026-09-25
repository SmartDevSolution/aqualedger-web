import 'server-only';
import {getRelayConfig} from '@/lib/api/server-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DP-4 P1(a) (Council issue #8): a same-origin route that resolves the frozen signed `preview_url`
// from the backend's result envelope server-side, using the same server-only relay credentials as
// `src/lib/api/relay.ts`, and streams the artifact bytes to the browser. This is not a second relay
// operation and not a new authorization model: the inbound request's `Authorization` header is
// never read, no credential is ever forwarded to the storage origin (the signed URL alone
// authorizes that fetch), and the signed URL is never logged, in this file or otherwise.
//
// Every failure path answers with a small, documented `{error: {code}}` JSON body instead of a
// fabricated image or a silent 200, so the browser can render an honest state. This is the full
// status set (also documented in docs/IMPLEMENTATION.md so the UI mapping in
// src/lib/preview/geotiff-overlay.ts cannot silently drift from this route):
//   - 503 PREVIEW_NOT_CONFIGURED      the relay itself is not configured (mirrors API_NOT_CONFIGURED)
//   - 200 PREVIEW_NOT_READY           the backend's own frozen 200 NOT_READY envelope (freeze B4):
//                                     the analysis has no committed result yet, including a FAILED
//                                     run (params.execution_status distinguishes the two) — never
//                                     a decode failure, since this body is JSON, not image bytes
//   - 502 PREVIEW_RESULT_UNAVAILABLE  the result request itself failed: a network error, or the
//                                     backend answered a non-200 instead of a committed result or
//                                     the frozen NOT_READY envelope (e.g. NOT_FOUND)
//   - 404 PREVIEW_ARTIFACT_MISSING    the committed result carries no `ndvi_preview` artifact
//   - 409 PREVIEW_ARTIFACT_NOT_READY  the artifact itself is not yet `ready`
//   - 503 PREVIEW_URL_UNAVAILABLE     the artifact is `ready`, but the backend minted no signed
//                                     `preview_url` for it — conditional on the backend's own
//                                     storage configuration (analyses.py `build_storage_client`),
//                                     not a property of the artifact's own readiness state
//   - 502 PREVIEW_FETCH_FAILED        the signed URL could not be fetched or returned a failure
export async function GET(request: Request, {params}: {params: Promise<{id: string}>}): Promise<Response> {
  const {id} = await params;
  const config = getRelayConfig();
  if (!config || !config.token) {
    return failure('PREVIEW_NOT_CONFIGURED', 503);
  }

  let resultResponse: Response;
  try {
    resultResponse = await fetch(`${config.baseUrl}/analyses/${encodeURIComponent(id)}/result`, {
      method: 'GET',
      headers: {Accept: 'application/json', Authorization: `Bearer ${config.token}`},
      cache: 'no-store'
    });
  } catch {
    return failure('PREVIEW_RESULT_UNAVAILABLE', 502);
  }

  const resultPayload: unknown = await resultResponse.json().catch(() => null);

  if (resultResponse.status === 200 && isNotReadyEnvelope(resultPayload)) {
    return failure('PREVIEW_NOT_READY', 200, resultPayload.error.params);
  }
  if (!resultResponse.ok || !isRecord(resultPayload)) {
    return failure('PREVIEW_RESULT_UNAVAILABLE', 502);
  }

  const artifact = findNdviPreviewArtifact(resultPayload);
  if (!artifact) {
    return failure('PREVIEW_ARTIFACT_MISSING', 404);
  }
  if (!artifact.ready) {
    return failure('PREVIEW_ARTIFACT_NOT_READY', 409);
  }
  if (typeof artifact.preview_url !== 'string' || artifact.preview_url.length === 0) {
    return failure('PREVIEW_URL_UNAVAILABLE', 503);
  }

  let assetResponse: Response;
  try {
    // No Authorization header here: the signed URL itself authorizes this request, and the
    // operator credential must never reach the storage origin.
    assetResponse = await fetch(artifact.preview_url, {cache: 'no-store'});
  } catch {
    return failure('PREVIEW_FETCH_FAILED', 502);
  }
  if (!assetResponse.ok || !assetResponse.body) {
    return failure('PREVIEW_FETCH_FAILED', 502);
  }

  const contentType = assetResponse.headers.get('content-type') ?? 'image/tiff';
  return new Response(assetResponse.body, {
    status: 200,
    headers: {'Content-Type': contentType, 'Cache-Control': 'private, no-store'}
  });
}

function failure(code: string, status: number, params: Record<string, unknown> = {}): Response {
  const body = JSON.stringify({error: {code, params, request_id: null}});
  return new Response(body, {status, headers: {'Content-Type': 'application/json'}});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotReadyEnvelope(value: unknown): value is {error: {code: 'NOT_READY'; params: Record<string, unknown>}} {
  return isRecord(value) && isRecord(value.error) && value.error.code === 'NOT_READY' && isRecord(value.error.params);
}

type NdviPreviewArtifact = {ready: boolean; preview_url?: string | null};

function findNdviPreviewArtifact(result: Record<string, unknown>): NdviPreviewArtifact | null {
  const artifacts = result.artifacts;
  if (!Array.isArray(artifacts)) {
    return null;
  }
  const artifact = artifacts.find((candidate) => isRecord(candidate) && candidate.kind === 'ndvi_preview');
  if (!isRecord(artifact) || typeof artifact.ready !== 'boolean') {
    return null;
  }
  return {ready: artifact.ready, preview_url: typeof artifact.preview_url === 'string' ? artifact.preview_url : null};
}
