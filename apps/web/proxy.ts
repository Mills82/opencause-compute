import { NextRequest, NextResponse } from 'next/server';

const protectedUiPrefixes = ['/admin', '/projects', '/work-packets', '/results', '/nodes'];
const ADMIN_COOKIE_NAME = 'opencause_admin';
const SESSION_VERSION = 1;

function base64url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacSha256(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function passwordFingerprint(password: string): Promise<string> {
  return (await hmacSha256('admin-ui-password-fingerprint', password)).slice(0, 24);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function uiPassword(): string | undefined {
  if (process.env.ADMIN_UI_PASSWORD) return process.env.ADMIN_UI_PASSWORD;
  if (process.env.OPENCAUSE_HOSTED !== 'true' && process.env.VERCEL !== '1') return process.env.ADMIN_API_KEY;
  if (process.env.ALLOW_ADMIN_API_KEY_UI_LOGIN === 'true') return process.env.ADMIN_API_KEY;
  return undefined;
}

function sessionSecret(): string | undefined {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_API_KEY;
}

async function isAdminCookieValid(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  if (process.env.NODE_ENV === 'development' && value === 'dev') return true;
  const secret = sessionSecret();
  const password = uiPassword();
  if (!secret || !password) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  if (!safeEqual(signature, await hmacSha256(payload, secret))) return false;

  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { v?: number; iat?: number; exp?: number; fp?: string };
    const now = Math.floor(Date.now() / 1000);
    if (decoded.v !== SESSION_VERSION || typeof decoded.iat !== 'number' || typeof decoded.exp !== 'number') return false;
    if (decoded.iat > now + 60 || decoded.exp <= now) return false;
    return decoded.fp === await passwordFingerprint(password);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedUi = protectedUiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtectedUi || pathname === '/admin/login') {
    return NextResponse.next();
  }

  if (await isAdminCookieValid(request.cookies.get(ADMIN_COOKIE_NAME)?.value)) {
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
