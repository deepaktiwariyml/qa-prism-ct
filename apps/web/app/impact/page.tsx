import Link from 'next/link';
import { moduleBySlug } from '@/lib/modules';

export const metadata = { title: 'PR impact analyser — QA Prism' };

export default function ImpactPage() {
  const mod = moduleBySlug('impact')!;
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm font-medium text-indigo-600">PR impact analyser</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Paste a pull request, get a manual tester’s checklist
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600">{mod.what}</p>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">GitHub pull request URL</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            disabled
            placeholder="https://github.com/owner/repo/pull/123"
            className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-400"
          />
          <button
            disabled
            className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500"
          >
            Analyse
          </button>
        </div>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Interactive analysis is being wired up next. It needs <code>ANTHROPIC_API_KEY</code> and{' '}
          <code>GITHUB_TOKEN</code> in the API’s environment — once connected, this form returns a
          risk-ranked list of areas to test, cross-linked to existing findings.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="text-sm font-medium text-indigo-600">How it will work</h2>
        <ol className="mt-4 flex flex-col gap-3">
          {mod.how.map((step, i) => (
            <li key={i} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span className="text-slate-700">{step}</span>
            </li>
          ))}
        </ol>
        <Link href="/modules/impact" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
          Read more about this module →
        </Link>
      </section>
    </div>
  );
}
