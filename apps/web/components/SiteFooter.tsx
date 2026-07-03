import Link from 'next/link';
import { Logo } from './Logo';

export function SiteFooter({ authed = false }: { authed?: boolean }) {
  return (
    <footer className="mt-24 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Logo className="h-5 w-5" />
          <span>QA Prism — unified quality intelligence for QA engineers.</span>
        </div>
        {authed && (
          <div className="flex gap-4 text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-slate-900">Dashboard</Link>
            <Link href="/generator" className="hover:text-slate-900">Generator</Link>
            <Link href="/impact" className="hover:text-slate-900">Impact</Link>
            <Link href="/modules" className="hover:text-slate-900">Modules</Link>
          </div>
        )}
      </div>
    </footer>
  );
}
