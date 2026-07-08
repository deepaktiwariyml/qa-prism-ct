import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  return jsonProxy(
    fetch(`${INTERNAL_API}/testcases/jira-search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    }),
  );
}
