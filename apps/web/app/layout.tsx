import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { COOKIE_NAME, sessionToken } from '@/lib/auth';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'QA Prism — Unified quality intelligence',
  description:
    'One place to understand product quality across accessibility, performance, security, and automation — plus PR impact analysis and framework scaffolding.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const password = process.env.APP_PASSWORD;
  const cookie = cookies().get(COOKIE_NAME)?.value;
  const authed = Boolean(password) && cookie === (await sessionToken(password!));
  const funEnabled = process.env.FUN_ENABLED === 'true';

  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col bg-white text-slate-900 antialiased">
        <SiteHeader authed={authed} funEnabled={funEnabled} />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
