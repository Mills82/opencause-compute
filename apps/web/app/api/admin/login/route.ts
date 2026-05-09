import { NextResponse } from 'next/server';
import { createAdminSessionCookieValue, getAdminCookieName } from '../../../../lib/admin-auth';
import { isDevMode } from '../../../../lib/runtime-config';

import { checkNamedRateLimit, rateLimitResponse } from '../../../../lib/rate-limit';
export async function POST(request: Request) {
  const rateLimit = checkNamedRateLimit(request, 'adminApi');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterSeconds);
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_API_KEY;

  if (!expected && !isDevMode()) {
    return NextResponse.json({ error: 'admin_auth_not_configured' }, { status: 503 });
  }

  if (expected && body.password !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAdminCookieName(), expected ? createAdminSessionCookieValue() : 'dev', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getAdminCookieName(), '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
