import { SystemPrompts } from '@/components/SystemPrompts';

export const metadata = { title: 'System Prompts — QA Prism' };

export default function SystemPromptsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm font-medium text-indigo-600">Under the hood</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">System prompts</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        These are the exact system prompts behind every AI call in the app — the instructions we
        believe produce the best results. They are shown here for transparency and reference. You
        can tailor them for your own runs; any overrides apply to your calls without changing what
        you see on this page.
      </p>

      <div className="mt-8">
        <SystemPrompts />
      </div>
    </div>
  );
}
