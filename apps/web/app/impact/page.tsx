import { moduleBySlug } from '@/lib/modules';
import { ImpactAnalyser } from '@/components/ImpactAnalyser';

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

      <div className="mt-8">
        <ImpactAnalyser />
      </div>

      <section className="mt-12">
        <h2 className="text-sm font-medium text-indigo-600">How it works</h2>
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
        <p className="mt-4 text-xs text-slate-500">
          Needs <code>ANTHROPIC_API_KEY</code> in the API environment. Add a GitHub token above for
          private repos or to avoid rate limits.
        </p>
      </section>
    </div>
  );
}
