import { createHash, timingSafeEqual } from 'node:crypto';
import { isDevMode } from './runtime-config';

const ADMIN_COOKIE_NAME = 'opencause_admin';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function adminPassword(): string | undefined {
  return process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_API_KEY;
}

export function getAdminCookieName(): string {
  return ADMIN_COOKIE_NAME;
}

export function createAdminSessionCookieValue(): string {
  const secret = adminPassword();
  if (!secret) {
    throw new Error('admin_secret_missing');
  }
  return createHash('sha256').update(`opencause-admin:${secret}`).digest('hex');
}

export function isAdminSessionCookieValid(value: string | undefined): boolean {
  if (!value) return false;
  const secret = adminPassword();
  if (!secret) return isDevMode();
  return safeEqual(value, createAdminSessionCookieValue());
}

function cookieValue(request: Request): string | undefined {
  const cookie = request.headers.get('cookie');
  return cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.slice(ADMIN_COOKIE_NAME.length + 1);
}

export function isAdminAuthorized(request: Request): boolean {
  const requiredKey = process.env.ADMIN_API_KEY;
  if (isAdminSessionCookieValid(cookieValue(request))) {
    return true;
  }
  if (!requiredKey) {
    return isDevMode();
  }

  const headerKey = request.headers.get('x-admin-key');
  if (headerKey && safeEqual(headerKey, requiredKey)) {
    return true;
  }

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    return safeEqual(token, requiredKey);
  }

  return false;
}

export function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return false;
  }

  const token = auth.slice('Bearer '.length).trim();
  return token === cronSecret;
}
