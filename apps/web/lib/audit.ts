import { randomUUID } from 'node:crypto';
import type { AuditEvent, DatabaseState } from '@opencause/shared';

export type AuditInput = Omit<AuditEvent, 'id' | 'createdAt' | 'metadata'> & {
  metadata?: Record<string, unknown>;
};

export function recordAuditEvent(db: DatabaseState, input: AuditInput): AuditEvent {
  const event: AuditEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    metadata: {},
    ...input
  };
  db.auditEvents.unshift(event);
  db.auditEvents = db.auditEvents.slice(0, 500);
  return event;
}

export function recentAuditEvents(db: DatabaseState, limit = 100): AuditEvent[] {
  return db.auditEvents.slice(0, limit);
}
