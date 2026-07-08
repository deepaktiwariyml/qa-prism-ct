import { INTERNAL_API, jsonProxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return jsonProxy(fetch(`${INTERNAL_API}/testcases/system-prompt`, { cache: 'no-store' }));
}
