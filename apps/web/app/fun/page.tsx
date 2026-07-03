import { notFound } from 'next/navigation';
import { WordSearchGame } from '@/components/WordSearchGame';

export const dynamic = 'force-dynamic';

/** The FUN section is gated behind FUN_ENABLED — hidden entirely when off. */
export default function FunPage() {
  if (process.env.FUN_ENABLED !== 'true') notFound();
  const companyName = process.env.COMPANY_NAME || 'Code and Theory';
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <WordSearchGame companyName={companyName} />
    </div>
  );
}
