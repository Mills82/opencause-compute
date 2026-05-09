import { NextRequest, NextResponse } from 'next/server';

const protectedUiPrefixes = ['/admin', '/projects', '/work-packets', '/results', '/nodes'];

async function expectedCookieValue(): Promise<string | null> {
  const secret = process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_API_KEY;
  if (!secret) return process.env.NODE_ENV === 'development' ? 'dev' : null;
  const data = new TextEncoder().encode(`opencause-admin:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedUi = protectedUiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtectedUi || pathname === '/admin/login') {
    return NextResponse.next();
  }

  const expected = await expectedCookieValue();
  if (expected && request.cookies.get('opencause_admin')?.value === expected) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/projects/:path*', '/work-packets/:path*', '/results/:path*', '/nodes/:path*']
};
