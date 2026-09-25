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
// fabricated image or a silent 200, so the browser can render an honest state:
//   - 503 PREVIEW_NOT_CONFIGURED      the relay itself is not configured (mirrors API_NOT_CONFIGURED)
//   - 200 PREVIEW_NOT_READY           the analysis result is not committed yet (mirrors the
//                                     backend's own 200 NOT_READY envelope)
//   - 502 PREVIEW_RESULT_UNAVAILABLE  the result could not be fetched, or was fetched but signals
//                                     something other than a committed result (e.g. a failed run)
//   - 404 PREVIEW_ARTIFACT_MISSING    the committed result carries no `ndvi_preview` artifact
//   - 409 PREVIEW_ARTIFACT_NOT_READY  the artifact exists but is not `ready` or has no `preview_url`
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
  if (!artifact.ready || typeof artifact.preview_url !== 'string' || artifact.preview_url.length === 0) {
    return failure('PREVIEW_ARTIFACT_NOT_READY', 409);
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
