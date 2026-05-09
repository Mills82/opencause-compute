import { afterEach, describe, expect, it } from 'vitest';
import { isAdminAuthorized } from '../lib/admin-auth';
import { extractNodeToken, isNodeAuthorized } from '../lib/node-auth';
import { registerNode } from '../lib/coordinator';
import type { DatabaseState } from '@opencause/shared';

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
});

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/test', { headers });
}

function emptyDb(): DatabaseState {
  return {
    projects: [], workPackets: [], nodes: [], claims: [], results: [], facts: [],
    workerControl: { paused: false, idleMode: 'user-and-cpu', minIdleSeconds: 120, maxCpuPercent: 35, runNowToken: 0, updatedAt: new Date().toISOString() }
  };
}

describe('admin auth hardening', () => {
  it('allows missing admin key only in dev/test mode', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ADMIN_API_KEY;
    expect(isAdminAuthorized(request())).toBe(true);
  });

  it('fails closed without admin key in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_API_KEY;
    expect(isAdminAuthorized(request())).toBe(false);
  });

  it('accepts correct production bearer token and rejects wrong token', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_API_KEY = 'secret-admin';
    expect(isAdminAuthorized(request({ authorization: 'Bearer secret-admin' }))).toBe(true);
    expect(isAdminAuthorized(request({ authorization: 'Bearer wrong' }))).toBe(false);
    expect(isAdminAuthorized(request())).toBe(false);
  });
});

describe('node token auth', () => {
  it('registers a node with a one-time token and stores only a hash', () => {
    const db = emptyDb();
    const registration = registerNode(db, { nodeName: 'n', platform: 'linux', version: '0.1.0', capabilities: [] });
    expect(registration.nodeToken).toBeTruthy();
    expect(db.nodes[0]).not.toHaveProperty('nodeToken');
    expect((db.nodes[0] as { nodeTokenHash?: string }).nodeTokenHash).toBeTruthy();
    expect((db.nodes[0] as { nodeTokenHash?: string }).nodeTokenHash).not.toBe(registration.nodeToken);
  });

  it('authorizes heartbeat/claim/submit callers only with the node token', () => {
    const db = emptyDb();
    const registration = registerNode(db, { nodeName: 'n', platform: 'linux', version: '0.1.0', capabilities: [] });
    expect(isNodeAuthorized(db, registration.node.id, registration.nodeToken)).toBe(true);
    expect(isNodeAuthorized(db, registration.node.id, 'wrong')).toBe(false);
    expect(isNodeAuthorized(db, registration.node.id, null)).toBe(false);
  });

  it('extracts bearer and x-node-token credentials', () => {
    expect(extractNodeToken(request({ authorization: 'Bearer abc' }))).toBe('abc');
    expect(extractNodeToken(request({ 'x-node-token': 'def' }))).toBe('def');
  });
});
