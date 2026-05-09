import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseState, VolunteerNode } from '@opencause/shared';

export function createNodeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashNodeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function extractNodeToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return request.headers.get('x-node-token');
}

export function isNodeAuthorized(db: DatabaseState, nodeId: string, token: string | null): boolean {
  if (!token) return false;
  const node = db.nodes.find((n: VolunteerNode & { nodeTokenHash?: string }) => n.id === nodeId) as
    | (VolunteerNode & { nodeTokenHash?: string })
    | undefined;
  if (!node?.nodeTokenHash || node.status === 'revoked' || node.status === 'suspended') return false;
  return safeEqualHex(hashNodeToken(token), node.nodeTokenHash);
}
