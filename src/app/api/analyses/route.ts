import {relay} from '@/lib/api/relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return relay(request, {backendPath: '/analyses', method: 'POST', useBearer: true});
}
