import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return jsonProxy(fetch(`${INTERNAL_API}/browser/${params.id}/confirm`, { method: 'POST' }));
}
