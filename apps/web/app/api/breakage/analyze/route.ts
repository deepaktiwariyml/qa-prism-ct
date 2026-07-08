import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
// The analysis fans out several LLM calls; give it room before the platform
// cuts the request.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.text();
  return jsonProxy(
    fetch(`${INTERNAL_API}/breakage/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    }),
  );
}
