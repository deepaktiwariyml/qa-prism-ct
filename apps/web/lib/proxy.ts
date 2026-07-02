/** The Fastify API base — server-only, never exposed to the browser. */
export const INTERNAL_API = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

/** Forward an upstream JSON response through, preserving status + body. */
export async function jsonProxy(upstream: Promise<Response>): Promise<Response> {
  try {
    const res = await upstream;
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `API unreachable: ${String(err)}` }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
