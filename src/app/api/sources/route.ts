import {relay} from '@/lib/api/relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return relay(request, {backendPath: '/sources', method: 'GET', useBearer: false});
}
