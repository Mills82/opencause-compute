import { randomUUID } from 'node:crypto';
import type { DatabaseState, PublicReport } from '@opencause/shared';
import { recordAuditEvent } from '../audit';

export function createPublicReport(db: DatabaseState, input: { targetType: PublicReport['targetType']; targetSlug?: string; reason: string; details?: string; reporterContact?: string }): PublicReport {
  const now = new Date().toISOString();
  const report: PublicReport = { id: randomUUID(), targetType: input.targetType, targetSlug: input.targetSlug ?? null, targetId: null, reason: input.reason.slice(0, 80), details: (input.details ?? '').slice(0, 1000), reporterContact: input.reporterContact?.slice(0, 200) ?? null, status: 'open', createdAt: now, reviewedAt: null };
  db.publicReports.push(report);
  recordAuditEvent(db, { actorType: 'system', action: 'public_report.created', targetType: input.targetType, targetId: input.targetSlug, metadata: { reason: report.reason } });
  return report;
}

export function moderatePublicTarget(db: DatabaseState, input: { targetType: PublicReport['targetType']; targetId: string; moderationStatus: 'ok' | 'hidden' | 'flagged'; note?: string }) {
  const apply = (target: { moderationStatus?: 'ok'|'hidden'|'flagged'; moderationNote?: string; publicProfileEnabled?: boolean; publicEnabled?: boolean }) => {
    target.moderationStatus = input.moderationStatus;
    target.moderationNote = input.note;
    if (input.moderationStatus === 'hidden') {
      if ('publicProfileEnabled' in target) target.publicProfileEnabled = false;
      if ('publicEnabled' in target) target.publicEnabled = false;
    }
  };
  if (input.targetType === 'volunteer_profile') {
    const target = db.volunteerProfiles.find((profile) => profile.id === input.targetId);
    if (!target) throw new Error('target_not_found');
    apply(target);
  } else if (input.targetType === 'team') {
    const target = db.teams.find((team) => team.id === input.targetId);
    if (!target) throw new Error('target_not_found');
    apply(target);
  } else {
    const target = db.impactCards.find((card) => card.id === input.targetId);
    if (!target) throw new Error('target_not_found');
    apply(target);
  }
  recordAuditEvent(db, { actorType: 'admin', action: 'public_moderation.updated', targetType: input.targetType, targetId: input.targetId, metadata: { moderationStatus: input.moderationStatus, note: input.note } });
  return { ok: true };
}
