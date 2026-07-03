import { INTERNAL_API } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${INTERNAL_API}/scans/${params.id}/screenshot`, { cache: 'no-store' });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'image/jpeg',
        'cache-control': 'private, max-age=300',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'API unreachable' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
