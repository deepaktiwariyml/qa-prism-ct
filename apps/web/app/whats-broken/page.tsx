import { notFound } from 'next/navigation';
import { INTERNAL_API } from '@/lib/proxy';
import { WhatsBroken } from '@/components/WhatsBroken';

export const dynamic = 'force-dynamic';
export const metadata = { title: "What's Broken — QA Prism" };

async function isEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${INTERNAL_API}/flags`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { whatsBroken?: boolean };
    return Boolean(data.whatsBroken);
  } catch {
    return false;
  }
}

export default async function WhatsBrokenPage() {
  // Gated behind the "I want to test What's Broken" Settings toggle.
  if (!(await isEnabled())) notFound();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <WhatsBroken />
    </div>
  );
}
