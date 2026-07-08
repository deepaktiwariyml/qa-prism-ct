import { WhatsBroken } from '@/components/WhatsBroken';

export const dynamic = 'force-dynamic';
export const metadata = { title: "What's Broken — QA Prism" };

export default function WhatsBrokenPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <WhatsBroken />
    </div>
  );
}
