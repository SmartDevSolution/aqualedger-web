import 'server-only';
import {getRelayConfig} from './server-config';

const NOT_CONFIGURED_BODY = JSON.stringify({error: {code: 'API_NOT_CONFIGURED', params: {}, request_id: null}});
const NETWORK_ERROR_BODY = JSON.stringify({error: {code: 'NETWORK_ERROR', params: {}, request_id: null}});

type RelayOptions = {
  backendPath: string;
  method: 'GET' | 'POST';
  /** The Bearer is added only on the three frozen B4 operations that require it. */
  useBearer: boolean;
};

/**
 * The Council DP-2 relay: same-origin route handlers call this to reach the pinned backend.
 * The inbound `Authorization` header is never read or forwarded — only `AQUALEDGER_OPERATOR_JWT`,
 * read server-side, is ever placed on an outbound request, and only for `useBearer` operations.
 * Status and body pass through unchanged, including a 200 `NOT_READY` and a signed `preview_url`.
 */
export async function relay(request: Request, options: RelayOptions): Promise<Response> {
  const config = getRelayConfig();
  if (!config || (options.useBearer && !config.token)) {
    return new Response(NOT_CONFIGURED_BODY, {status: 503, headers: {'Content-Type': 'application/json'}});
  }

  const outboundHeaders = new Headers({Accept: 'application/json'});
  const contentType = request.headers.get('content-type');
  if (contentType) {
    outboundHeaders.set('Content-Type', contentType);
  }
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) {
    outboundHeaders.set('Idempotency-Key', idempotencyKey);
  }
  if (options.useBearer && config.token) {
    outboundHeaders.set('Authorization', `Bearer ${config.token}`);
  }

  const init: RequestInit = {method: options.method, headers: outboundHeaders, cache: 'no-store'};
  if (options.method === 'POST') {
    init.body = await request.text();
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${config.baseUrl}${options.backendPath}`, init);
  } catch {
    return new Response(NETWORK_ERROR_BODY, {status: 502, headers: {'Content-Type': 'application/json'}});
  }

  const body = await backendResponse.text();
  const responseContentType = backendResponse.headers.get('content-type') ?? 'application/json';
  return new Response(body, {status: backendResponse.status, headers: {'Content-Type': responseContentType}});
}
