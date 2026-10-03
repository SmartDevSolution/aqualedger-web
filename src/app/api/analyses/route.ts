import {relay} from '@/lib/api/relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CURSOR_LENGTH = 512;

export async function POST(request: Request): Promise<Response> {
  return relay(request, {backendPath: '/analyses', method: 'POST', useBearer: true});
}

/**
 * The M3 history read (`GET /analyses`): the Bearer is added server-side exactly as for the other
 * authorized operations. Only the opaque `cursor` (and a bounded integer `limit`) is forwarded,
 * re-encoded here — never the inbound query string verbatim — so the relay cannot be used to
 * smuggle other parameters or paths to the backend.
 */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url).searchParams;
  const outgoing = new URLSearchParams();
  const cursor = incoming.get('cursor');
  if (cursor && cursor.length <= MAX_CURSOR_LENGTH) outgoing.set('cursor', cursor);
  const limit = incoming.get('limit');
  if (limit && /^\d{1,3}$/.test(limit)) outgoing.set('limit', limit);
  const query = outgoing.toString();
  return relay(request, {backendPath: `/analyses${query ? `?${query}` : ''}`, method: 'GET', useBearer: true});
}
