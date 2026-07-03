import { INTERNAL_API } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const res = await fetch(`${INTERNAL_API}/fun/words`, {
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
    // API unreachable — client falls back to its static word pool.
    return new Response(JSON.stringify({ words: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
}
