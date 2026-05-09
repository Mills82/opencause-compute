export function isAdminAuthorized(request: Request): boolean {
  const requiredKey = process.env.ADMIN_API_KEY;
  if (!requiredKey) {
    return true;
  }

  const headerKey = request.headers.get('x-admin-key');
  if (headerKey && headerKey === requiredKey) {
    return true;
  }

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    return token === requiredKey;
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
