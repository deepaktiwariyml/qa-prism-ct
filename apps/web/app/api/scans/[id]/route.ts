import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return jsonProxy(fetch(`${INTERNAL_API}/scans/${params.id}`, { cache: 'no-store' }));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${INTERNAL_API}/scans/${params.id}`, { method: 'DELETE' });
    return new Response(null, { status: res.status });
  } catch (err) {
    return new Response(JSON.stringify({ error: `API unreachable: ${String(err)}` }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
