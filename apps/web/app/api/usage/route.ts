import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const qs = new URL(req.url).search;
  return jsonProxy(fetch(`${INTERNAL_API}/usage${qs}`, { cache: 'no-store' }));
}
