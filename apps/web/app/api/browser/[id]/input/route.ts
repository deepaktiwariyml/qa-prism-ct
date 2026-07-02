import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.text();
  return jsonProxy(
    fetch(`${INTERNAL_API}/browser/${params.id}/input`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
}
