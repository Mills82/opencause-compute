import { afterEach, describe, expect, it } from 'vitest';
import { createAdminSessionCookieValue, getAdminCookieName, getExpectedAdminUiPassword, isAdminAuthorized, isAdminSessionCookieValid } from '../lib/admin-auth';
import { DELETE, POST } from '../app/api/admin/login/route';

const OLD_ENV = { ...process.env };
afterEach(() => { process.env = { ...OLD_ENV }; });

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/test', { headers });
}

function loginRequest(password: string): Request {
  return new Request('http://localhost/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
}

describe('admin session hardening', () => {
  it('creates rotating signed sessions that expire', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_UI_PASSWORD = 'ui-secret';
    process.env.ADMIN_API_KEY = 'api-secret';
    process.env.ADMIN_SESSION_SECRET = 'session-secret';
    const first = createAdminSessionCookieValue(1_000_000);
    const second = createAdminSessionCookieValue(1_000_000);
    expect(first).not.toBe(second);
    expect(isAdminSessionCookieValid(first, 1_000_000)).toBe(true);
    expect(isAdminSessionCookieValid(first, 1_000_000 + 9 * 60 * 60 * 1000)).toBe(false);
  });

  it('invalidates sessions when UI password changes', () => {
    process.env.ADMIN_UI_PASSWORD = 'old-password';
    process.env.ADMIN_SESSION_SECRET = 'stable-session-secret';
    const cookie = createAdminSessionCookieValue();
    expect(isAdminSessionCookieValid(cookie)).toBe(true);
    process.env.ADMIN_UI_PASSWORD = 'new-password';
    expect(isAdminSessionCookieValid(cookie)).toBe(false);
  });

  it('keeps API key auth for headers while separating hosted UI password by default', () => {
    process.env.NODE_ENV = 'production';
    process.env.OPENCAUSE_HOSTED = 'true';
    process.env.ADMIN_API_KEY = 'api-secret';
    delete process.env.ADMIN_UI_PASSWORD;
    delete process.env.ALLOW_ADMIN_API_KEY_UI_LOGIN;
    expect(getExpectedAdminUiPassword()).toBeUndefined();
    expect(isAdminAuthorized(request({ authorization: 'Bearer api-secret' }))).toBe(true);
  });

  it('allows explicit API-key UI login fallback only when configured', () => {
    process.env.OPENCAUSE_HOSTED = 'true';
    process.env.ADMIN_API_KEY = 'api-secret';
    process.env.ALLOW_ADMIN_API_KEY_UI_LOGIN = 'true';
    expect(getExpectedAdminUiPassword()).toBe('api-secret');
  });

  it('login route rotates sessions and logout clears the cookie', async () => {
    process.env.ADMIN_UI_PASSWORD = 'ui-secret';
    process.env.ADMIN_SESSION_SECRET = 'session-secret';
    const first = await POST(loginRequest('ui-secret'));
    const second = await POST(loginRequest('ui-secret'));
    const firstCookie = first.headers.get('set-cookie') ?? '';
    const secondCookie = second.headers.get('set-cookie') ?? '';
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstCookie).toContain(`${getAdminCookieName()}=`);
    expect(secondCookie).toContain(`${getAdminCookieName()}=`);
    expect(firstCookie).not.toBe(secondCookie);
    const logout = await DELETE();
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('fails closed for missing hosted UI password', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OPENCAUSE_HOSTED = 'true';
    process.env.ADMIN_API_KEY = 'api-secret';
    delete process.env.ADMIN_UI_PASSWORD;
    const response = await POST(loginRequest('api-secret'));
    expect(response.status).toBe(503);
  });
});
