import Link from 'next/link';
import { fetchRecentScans, type RecentScan } from '@/lib/api';
import { RunScanForm } from '@/components/RunScanForm';
import { scoreTextClass, statusBadge } from '@/lib/ui';

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
        ) : scans.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No scans yet — run one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {scans.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/scans/${s.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.target.name || s.target.value}</div>
                    <div className="truncate text-xs text-slate-500">{s.target.value}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    {s.score ? (
                      <span className={`text-lg font-semibold ${scoreTextClass(s.score.overall)}`}>
                        {s.score.overall}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(s.status)}`}
                    >
                      {s.status}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
