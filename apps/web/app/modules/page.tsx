import Link from 'next/link';
import { MODULES } from '@/lib/modules';

export default function ModulesIndex() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-sm font-medium text-indigo-600">Modules</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">How QA Prism works, module by module</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Each module is a focused capability that emits the same canonical finding. Open one to see
        what it does, how it works under the hood, and how to use it.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <Link
            key={m.slug}
            href={`/modules/${m.slug}`}
            className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-300 hover:shadow-sm"
          >
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${m.accent} text-sm font-semibold text-white`}>
              {m.name.charAt(0)}
            </div>
            <h2 className="mt-4 font-medium">{m.name}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{m.tagline}</p>
            <span className="mt-4 inline-block text-sm font-medium text-indigo-600 group-hover:underline">
              Learn more →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
