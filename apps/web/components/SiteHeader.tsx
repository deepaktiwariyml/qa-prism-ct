'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/generator', label: 'Generator' },
  { href: '/impact', label: 'Impact analyser' },
  { href: '/modules', label: 'Modules' },
];

export function SiteHeader() {
  const pathname = usePathname();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">
            QA <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Prism</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <button
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
          >
            Log out
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Run a scan
          </Link>
        </div>
      </div>
    </header>
  );
}
