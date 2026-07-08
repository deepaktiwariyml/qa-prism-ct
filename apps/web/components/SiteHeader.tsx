'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const NAV = [
  { href: '/dashboard', label: 'Scan Website' },
  { href: '/testcases', label: 'Test Cases' },
  { href: '/generator', label: 'Framework Generator' },
  { href: '/impact', label: 'Impact analyser' },
  { href: '/system-prompts', label: 'System Prompts' },
  { href: '/consumption', label: 'Usage' },
];

export function SiteHeader({
  authed = false,
  funEnabled = false,
  desktop = false,
}: {
  authed?: boolean;
  funEnabled?: boolean;
  desktop?: boolean;
}) {
  const pathname = usePathname();
  // The desktop build excludes Website Scans (no DB/Redis/Chromium), so drop
  // that nav entry there.
  const base = desktop ? NAV.filter((n) => n.href !== '/dashboard') : NAV;
  const nav = funEnabled ? [...base, { href: '/fun', label: '🎮 Fun' }] : base;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  function openDesktopSettings() {
    (window as unknown as { qaprism?: { openSettings?: () => void } }).qaprism?.openSettings?.();
  }

  return (
    <header
      className={`sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur ${
        desktop ? 'app-drag' : ''
      }`}
    >
      <div
        className={`mx-auto flex items-center justify-between py-3 pr-6 ${
          // Desktop is full-width (no max-width cap); leave room for the macOS
          // traffic-light buttons on the left when framing our own header.
          desktop ? 'max-w-none pl-20' : 'max-w-6xl pl-6'
        }`}
      >
        <Link href="/" className="app-no-drag flex shrink-0 items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="flex items-center gap-2">
            <span className="text-[17px] font-semibold tracking-tight text-slate-900">
              Code &amp; Theory
            </span>
            <span className="hidden rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm sm:inline">
              {desktop ? 'QA Studio' : 'QA Prism'}
            </span>
            <span className="hidden rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 sm:inline">
              Internal use only
            </span>
          </span>
        </Link>
        <nav className="app-no-drag hidden items-center gap-0.5 md:flex">
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
        <div className="app-no-drag flex shrink-0 items-center gap-1">
          {desktop ? (
            <button
              onClick={openDesktopSettings}
              title="Settings (⌘,)"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Settings
            </button>
          ) : authed ? (
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
