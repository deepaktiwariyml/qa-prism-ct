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
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Logo className="h-5 w-5" />
          <span>
            {desktop ? 'QA Studio' : 'QA Prism'} — quality intelligence, built by{' '}
            <strong className="font-semibold text-slate-700">Code &amp; Theory</strong>.
          </span>
        </div>
        {authed && (
          <div className="flex gap-4 text-sm text-slate-500">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-slate-900">
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
