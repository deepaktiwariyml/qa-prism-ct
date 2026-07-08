import Link from 'next/link';
import { MODULES } from '@/lib/modules';

const PILLARS = [
  { name: 'Accessibility', desc: 'axe-core WCAG crawl', dot: 'bg-fuchsia-500' },
  { name: 'Performance', desc: 'Lighthouse Core Web Vitals', dot: 'bg-amber-500' },
  { name: 'Security', desc: 'passive header & cookie checks', dot: 'bg-emerald-500' },
  { name: 'Automation', desc: 'test-suite health', dot: 'bg-sky-500' },
];

const FLOW = [
  { step: '01', title: 'Point it at a target', body: 'A URL, a repo, or a GitHub PR. One canonical finding shape underpins everything.' },
  { step: '02', title: 'Scanners run in parallel', body: 'Four pillars scan on a queue; each emits normalized findings with severity and remediation.' },
  { step: '03', title: 'Score & correlate', body: 'Findings roll up into pillar and overall scores — and link across pillars where they share an area.' },
  { step: '04', title: 'Act', body: 'Generate a manual test plan, scaffold a framework, analyse a PR’s blast radius, and push findings to your tracker.' },
];

/** The tools available in the desktop build (LLM-powered, no scanners). */
const DESKTOP_TOOLS = [
  {
    href: '/testcases',
    emoji: '📝',
    name: 'Test Cases',
    desc: 'Turn a feature or requirement into a comprehensive, review-ready set of manual test cases — or Gherkin scenarios.',
    accent: 'from-rose-500 to-pink-500',
  },
  {
    href: '/impact',
    emoji: '🔍',
    name: 'Impact Analyser',
    desc: 'Paste a pull request and get a plain-language read on what changed, what it touches, and what to test.',
    accent: 'from-violet-500 to-indigo-500',
  },
  {
    href: '/generator',
    emoji: '⚙️',
    name: 'Framework Generator',
    desc: 'Pick a stack and download a runnable automation framework — or clone the shared one.',
    accent: 'from-cyan-500 to-blue-500',
  },
  {
    href: '/consumption',
    emoji: '💰',
    name: 'Usage',
    desc: 'See exactly how many tokens each AI call used and what it cost, day by day.',
    accent: 'from-emerald-500 to-teal-500',
  },
];

function DesktopLanding() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <section className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Your AI QA copilot — on your machine
        </span>
        <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-900">
          Better testing,{' '}
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            in a few clicks
          </span>
          .
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">
          Write test cases, understand what a pull request really changes, and scaffold automation
          frameworks — powered by Claude, running locally with your own key.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            href="/testcases"
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Generate test cases
          </Link>
          <Link
            href="/impact"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Analyse a PR
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        {DESKTOP_TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-300 hover:shadow-sm"
          >
            <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${t.accent} text-lg`}>
              <span>{t.emoji}</span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">{t.name}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.desc}</p>
            <span className="mt-4 inline-block text-sm font-medium text-indigo-600 group-hover:underline">
              Open →
            </span>
          </Link>
        ))}
      </section>

      <p className="mt-10 text-center text-sm text-slate-400">
        Set your Anthropic API key anytime from{' '}
        <span className="font-medium text-slate-500">Settings</span> (top-right, or ⌘,).
      </p>
    </div>
  );
}

export default function Landing() {
  if (process.env.DESKTOP_MODE === '1') return <DesktopLanding />;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-indigo-50/80 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Four disciplines. One canonical finding.
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold leading-tight tracking-tight text-slate-900">
            Quality intelligence,{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              unified
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            QA Prism scans a target across accessibility, performance, security, and automation,
            correlates what it finds across pillars, analyses the blast radius of a pull request,
            generates manual test cases, and scaffolds a runnable test framework — in one place.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
            >
              Run your first scan
            </Link>
            <Link
              href="/modules"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Explore the modules
            </Link>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {PILLARS.map((p) => (
              <div key={p.name} className="rounded-xl border border-slate-200 bg-white/70 p-4 text-left">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${p.dot}`} />
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-indigo-600">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">From target to action in four steps</h2>
          <p className="mt-3 text-slate-600">
            Every module emits the same <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">Finding</code>{' '}
            shape — which is exactly what lets QA Prism correlate an accessibility failure with a
            fragile test selector on the same feature.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {FLOW.map((f) => (
            <div key={f.step} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-sm font-semibold text-indigo-600">{f.step}</div>
              <h3 className="mt-2 font-medium">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-indigo-600">Modules</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Seven tools, one platform</h2>
            <p className="mt-3 text-slate-600">
              Each module is a focused capability. Open any one to see what it does and how to use it.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <Link
                key={m.slug}
                href={`/modules/${m.slug}`}
                className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-300 hover:shadow-sm"
              >
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${m.accent} text-white`}>
                  <span className="text-sm font-semibold">{m.name.charAt(0)}</span>
                </div>
                <h3 className="mt-4 font-medium">{m.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{m.tagline}</p>
                <span className="mt-4 inline-block text-sm font-medium text-indigo-600 group-hover:underline">
                  Learn more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
