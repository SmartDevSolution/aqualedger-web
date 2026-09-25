import {relay} from '@/lib/api/relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, {params}: {params: Promise<{id: string}>}): Promise<Response> {
  const {id} = await params;
  return relay(request, {backendPath: `/analyses/${encodeURIComponent(id)}`, method: 'GET', useBearer: true});
}
