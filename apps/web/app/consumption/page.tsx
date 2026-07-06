import { ConsumptionDetails } from '@/components/ConsumptionDetails';

export const metadata = { title: 'Consumption — QA Prism' };

export default function ConsumptionPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm font-medium text-indigo-600">AI usage</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Consumption details</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Token usage and estimated cost of every AI call across the app — test-case generation,
        explain, combine, column fill, and PR impact analysis — totalled per day so you can stay
        mindful of spend.
      </p>

      <div className="mt-8">
        <ConsumptionDetails />
      </div>
    </div>
  );
}
