import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isDevMode, isHostedMode } from './runtime-config';

const ADMIN_COOKIE_NAME = 'opencause_admin';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const SESSION_VERSION = 1;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function uiPassword(): string | undefined {
  if (process.env.ADMIN_UI_PASSWORD) return process.env.ADMIN_UI_PASSWORD;
  if (!isHostedMode() || process.env.ALLOW_ADMIN_API_KEY_UI_LOGIN === 'true') return process.env.ADMIN_API_KEY;
  return undefined;
}

function sessionSecret(): string | undefined {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_UI_PASSWORD || process.env.ADMIN_API_KEY;
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function passwordFingerprint(secret: string): string {
  return createHmac('sha256', secret).update('admin-ui-password-fingerprint').digest('base64url').slice(0, 24);
}

export function getAdminCookieName(): string {
  return ADMIN_COOKIE_NAME;
}

export function getExpectedAdminUiPassword(): string | undefined {
  return uiPassword();
}

export function createAdminSessionCookieValue(nowMs = Date.now()): string {
  const secret = sessionSecret();
  const password = uiPassword();
  if (!secret || !password) throw new Error('admin_secret_missing');
  const iat = Math.floor(nowMs / 1000);
  const payload = base64urlJson({ v: SESSION_VERSION, sid: randomBytes(18).toString('base64url'), iat, exp: iat + ADMIN_SESSION_MAX_AGE_SECONDS, fp: passwordFingerprint(password) });
  return `${payload}.${sign(payload, secret)}`;
}

export function isAdminSessionCookieValid(value: string | undefined, nowMs = Date.now()): boolean {
  if (!value) return false;
  const secret = sessionSecret();
  const password = uiPassword();
  if (!secret || !password) return isDevMode() && value === 'dev';
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { v?: number; iat?: number; exp?: number; fp?: string };
    const now = Math.floor(nowMs / 1000);
    if (decoded.v !== SESSION_VERSION || typeof decoded.iat !== 'number' || typeof decoded.exp !== 'number') return false;
    if (decoded.iat > now + 60 || decoded.exp <= now) return false;
    return decoded.fp === passwordFingerprint(password);
  } catch {
    return false;
  }
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
  if (isAdminSessionCookieValid(cookieValue(request))) return true;
  if (!requiredKey) return isDevMode() && !isHostedMode();

  const headerKey = request.headers.get('x-admin-key');
  if (headerKey && safeEqual(headerKey, requiredKey)) return true;

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    return safeEqual(token, requiredKey);
  }

  return false;
}

export function isCronAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  return token === cronSecret;
}
