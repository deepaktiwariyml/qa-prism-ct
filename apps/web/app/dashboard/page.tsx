import { fetchRecentScans, type RecentScan } from '@/lib/api';
import { RunScanForm } from '@/components/RunScanForm';
import { RecentScans } from '@/components/RecentScans';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  let scans: RecentScan[] = [];
  let error: string | null = null;
  try {
    scans = await fetchRecentScans();
  } catch (e) {
    error = String(e);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scan a target across accessibility, performance, security, and automation.
        </p>
      </div>

      <RunScanForm />

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent scans</h2>
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Could not reach the API ({error}). Is it running on{' '}
            {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}?
          </p>
        ) : (
          <RecentScans scans={scans} />
        )}
      </div>
    </div>
  );
}
