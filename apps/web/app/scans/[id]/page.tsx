import { notFound } from 'next/navigation';
import { fetchScan } from '@/lib/api';
import { ScanDetailView } from '@/components/ScanDetail';

export const dynamic = 'force-dynamic';

export default async function ScanPage({ params }: { params: { id: string } }) {
  let scan;
  try {
    scan = await fetchScan(params.id);
  } catch (e) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Could not load this scan: {String(e)}
      </div>
    );
  }
  if (!scan) notFound();
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <ScanDetailView initial={scan} />
    </div>
  );
}
