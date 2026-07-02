import { INTERNAL_API } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${INTERNAL_API}/browser/${params.id}/screenshot`, { cache: 'no-store' });
    if (!res.ok) return new Response(null, { status: res.status });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
