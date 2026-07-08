import Link from 'next/link';
import { Logo } from './Logo';

export function SiteFooter({ authed = false, desktop = false }: { authed?: boolean; desktop?: boolean }) {
  const links = desktop
    ? [
        { href: '/testcases', label: 'Test Cases' },
        { href: '/generator', label: 'Generator' },
        { href: '/impact', label: 'Impact' },
        { href: '/consumption', label: 'Usage' },
      ]
    : [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/generator', label: 'Generator' },
        { href: '/impact', label: 'Impact' },
        { href: '/modules', label: 'Modules' },
      ];
  return (
    <footer className="mt-24 border-t border-slate-200 bg-slate-50">
      <div
        className={`mx-auto flex flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between ${
          desktop ? 'max-w-none' : 'max-w-6xl'
        }`}
      >
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Logo className="h-5 w-5" />
          <span>
            {desktop ? 'QA Studio' : 'QA Prism'} — quality intelligence, built by{' '}
            <strong className="font-semibold text-slate-700">Code &amp; Theory</strong>.
          </span>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {authed && (
            <div className="flex gap-4 text-sm text-slate-500">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="hover:text-slate-900">
                  {l.label}
                </Link>
              ))}
            </div>
          )}
          <span className="text-xs text-slate-400">
            Team behind this:{' '}
            <span className="font-medium text-slate-600">
              Deepak Tiwari, Vinoth Pandian, Darshan Keerthi, Manjunath Somashekar
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
