import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { COOKIE_NAME, sessionToken } from '@/lib/auth';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'QA Prism · Code & Theory',
  description:
    'One place to understand product quality across accessibility, performance, security, and automation — plus PR impact analysis and framework scaffolding.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const password = process.env.APP_PASSWORD;
  const cookie = cookies().get(COOKIE_NAME)?.value;
  // Desktop app runs locally with no login — always treat as authed there.
  const desktop = process.env.DESKTOP_MODE === '1';
  const authed = desktop || (Boolean(password) && cookie === (await sessionToken(password!)));
  const funEnabled = process.env.FUN_ENABLED === 'true';

  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col bg-white text-slate-900 antialiased">
        <SiteHeader authed={authed} funEnabled={funEnabled} desktop={desktop} />
        <div className="flex-1">{children}</div>
        <SiteFooter authed={authed} desktop={desktop} />
      </body>
    </html>
  );
}
