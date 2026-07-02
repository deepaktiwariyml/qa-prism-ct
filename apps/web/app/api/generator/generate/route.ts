import { INTERNAL_API } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const res = await fetch(`${INTERNAL_API}/generator/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
      });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="framework.zip"',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `API unreachable: ${String(err)}` }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
