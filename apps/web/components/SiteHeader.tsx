'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const NAV = [
  { href: '/dashboard', label: 'Scan Website' },
  { href: '/testcases', label: 'Test Cases' },
  { href: '/generator', label: 'Framework Generator' },
  { href: '/impact', label: 'Impact analyser' },
  { href: '/consumption', label: 'Usage' },
];

export function SiteHeader({
  authed = false,
  funEnabled = false,
}: {
  authed?: boolean;
  funEnabled?: boolean;
}) {
  const pathname = usePathname();
  const nav = funEnabled ? [...NAV, { href: '/fun', label: '🎮 Fun' }] : NAV;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="flex items-center gap-2">
            <span className="text-[17px] font-semibold tracking-tight text-slate-900">
              Code &amp; Theory
            </span>
            <span className="hidden rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm sm:inline">
              QA Prism
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-0.5 md:flex">
          {authed &&
            nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          {authed ? (
            <button
              onClick={logout}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
            >
              Log out
            </button>
          ) : (
            <Link
              href="/login"
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
