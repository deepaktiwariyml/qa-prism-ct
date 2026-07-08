import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_NAME, sessionToken } from '@/lib/auth';

/**
 * Shared-password gate. Everything requires a valid session cookie except the
 * login page and the auth endpoints. Unauthenticated API (BFF) calls get 401;
 * unauthenticated page loads redirect to /login.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Desktop app: the UI runs locally for a single user — no shared-password
  // gate. Enabled by the Electron host, never in the hosted deployment.
  if (process.env.DESKTOP_MODE === '1') {
    return NextResponse.next();
  }

  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const authed = Boolean(password) && cookie === (await sessionToken(password!));
  if (authed) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('from', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
