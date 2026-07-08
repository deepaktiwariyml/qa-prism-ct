import { GeneratorConfigurator } from '@/components/GeneratorConfigurator';
import { SharedFrameworkCard } from '@/components/SharedFrameworkCard';

export const metadata = { title: 'Framework generator — QA Prism' };

export default function GeneratorPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm font-medium text-indigo-600">Framework generator</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        A runnable automation framework, in four choices
      </h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Pick a stack and download a complete, compiling framework — page objects, fixtures,
        reporting, CI, and a README. Template-first and deterministic, so what you download runs.
      </p>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <GeneratorConfigurator />
      </div>

      <div className="mt-8">
        <SharedFrameworkCard />
      </div>
    </div>
  );
}
