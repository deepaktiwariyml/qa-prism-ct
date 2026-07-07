import { INTERNAL_API } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const res = await fetch(`${INTERNAL_API}/testcases/explain-feature`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'API unreachable' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
