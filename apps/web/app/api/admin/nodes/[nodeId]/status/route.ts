import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdminAuthorized } from '../../../../../../lib/admin-auth';
import { withDb } from '../../../../../../lib/db';
import { recordAuditEvent } from '../../../../../../lib/audit';

const requestSchema = z.object({
  status: z.enum(['online', 'offline', 'suspended', 'revoked'])
});

export async function POST(request: Request, { params }: { params: { nodeId: string } }) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const node = await withDb((db) => {
    const existing = db.nodes.find((candidate) => candidate.id === params.nodeId);
    if (!existing) throw new Error('node_not_found');
    existing.status = parsed.data.status;
    if (parsed.data.status === 'revoked') existing.revokedAt = new Date().toISOString();
    if (parsed.data.status === 'suspended') existing.suspendedAt = new Date().toISOString();
    recordAuditEvent(db, {
      actorType: 'admin',
      action: 'node.status.updated',
      targetType: 'node',
      targetId: existing.id,
      metadata: { status: parsed.data.status }
    });
    return existing;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'node_not_found') return null;
    throw error;
  });

  if (!node) {
    return NextResponse.json({ error: 'node_not_found' }, { status: 404 });
  }

  const { nodeTokenHash: _nodeTokenHash, enrollmentCodeHash: _enrollmentCodeHash, ...publicNode } = node;
  return NextResponse.json({ node: publicNode });
}
