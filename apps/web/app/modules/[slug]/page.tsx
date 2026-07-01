import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MODULES, moduleBySlug } from '@/lib/modules';

export function generateStaticParams() {
  return MODULES.map((m) => ({ slug: m.slug }));
}

export default function ModulePage({ params }: { params: { slug: string } }) {
  const mod = moduleBySlug(params.slug);
  if (!mod) notFound();

  return (
    <div>
      <section className={`bg-gradient-to-br ${mod.accent}`}>
        <div className="mx-auto max-w-4xl px-6 py-16 text-white">
          <Link href="/modules" className="text-sm text-white/80 hover:text-white">
            ← All modules
          </Link>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{mod.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/90">{mod.tagline}</p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <section>
          <h2 className="text-sm font-medium text-indigo-600">What it does</h2>
          <p className="mt-2 text-lg leading-relaxed text-slate-700">{mod.what}</p>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-medium text-indigo-600">How it works</h2>
          <ol className="mt-4 flex flex-col gap-3">
            {mod.how.map((step, i) => (
              <li key={i} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${mod.dot}`}>
                  {i + 1}
                </span>
                <span className="text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-medium text-indigo-600">Signals it produces</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {mod.codes.map((c) => (
              <span
                key={c}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-sm text-slate-700"
              >
                {c}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="font-medium">How to use it</h2>
          <p className="mt-1 text-sm text-slate-600">Jump straight in — no setup beyond a target.</p>
          <Link
            href={mod.use.href}
            className="mt-4 inline-block rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            {mod.use.label}
          </Link>
        </section>
      </div>
    </div>
  );
}
