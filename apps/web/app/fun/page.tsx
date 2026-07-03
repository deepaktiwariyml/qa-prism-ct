import { notFound } from 'next/navigation';
import { WordSearchGame } from '@/components/WordSearchGame';

export const dynamic = 'force-dynamic';

/** The FUN section is gated behind FUN_ENABLED — hidden entirely when off. */
export default function FunPage() {
  if (process.env.FUN_ENABLED !== 'true') notFound();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <WordSearchGame />
    </div>
  );
}
