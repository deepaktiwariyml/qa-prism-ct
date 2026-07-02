import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  return jsonProxy(
    fetch(`${INTERNAL_API}/impact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
}
