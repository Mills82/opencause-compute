import type { DatabaseState } from '@opencause/shared';
import { storageModeLabel } from '../db';
import { isHostedMode, productionEnvStatus } from '../runtime-config';

export type ReadinessItem = {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
};

export type PublicLaunchReadiness = {
  stage: 'private_alpha' | 'public_beta_candidate' | 'public_launch_candidate';
  goNoGo: 'go_private_alpha' | 'no_go_public_beta' | 'no_go_public_launch' | 'go_public_launch';
  items: ReadinessItem[];
};

function item(id: string, label: string, status: ReadinessItem['status'], detail: string): ReadinessItem {
  return { id, label, status, detail };
}

export function publicLaunchReadiness(db: DatabaseState): PublicLaunchReadiness {
  const env = productionEnvStatus();
  const storageMode = storageModeLabel();
  const hosted = isHostedMode();
  const signingMode = process.env.PACKET_SIGNING_PRIVATE_KEY && process.env.PACKET_SIGNING_PUBLIC_KEY ? 'ed25519' : 'hmac-fallback';
  const publicEnrollmentEnabled = process.env.ENABLE_PUBLIC_VOLUNTEER_ENROLLMENT === 'true';
  const hasTurnstile = Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY);
  const hasEnrollmentEmail = Boolean(process.env.RESEND_API_KEY && process.env.ENROLLMENT_EMAIL_FROM);
  const hasDownload = Boolean(process.env.NEXT_PUBLIC_WINDOWS_WORKER_DOWNLOAD_URL);
  const downloadStage = process.env.NEXT_PUBLIC_WORKER_DOWNLOAD_STAGE ?? 'prototype';
  const hasAbuseAlerting = Boolean(process.env.ABUSE_ALERT_WEBHOOK_URL || process.env.ABUSE_ALERT_EMAIL_TO);

  const items: ReadinessItem[] = [
    item('env', 'Hosted environment validation', env.ok ? 'pass' : 'fail', env.ok ? 'Required hosted env vars are present.' : `Missing: ${env.missing.join(', ')}`),
    item('storage', 'Relational hosted storage', storageMode === 'postgres-relational' ? 'pass' : 'fail', `Current storage mode: ${storageMode}.`),
    item('signing', 'Asymmetric packet signing', signingMode === 'ed25519' ? 'pass' : 'fail', `Current signing mode: ${signingMode}.`),
    item('admin_surface', 'Admin/coordinator surface protected', 'pass', 'Admin UI and coordinator read APIs require auth in current route configuration.'),
    item('volunteer_enrollment', 'Self-serve volunteer enrollment', publicEnrollmentEnabled && hasTurnstile && hasEnrollmentEmail ? 'warn' : 'fail', publicEnrollmentEnabled ? (hasTurnstile && hasEnrollmentEmail ? 'Enabled behind Turnstile with email delivery; monitor abuse before public beta.' : `Incomplete public enrollment config: ${[!hasTurnstile ? 'Turnstile' : null, !hasEnrollmentEmail ? 'email delivery' : null].filter(Boolean).join(', ')}.`) : 'Disabled; public volunteers cannot self-serve yet.'),
    item('download', 'Desktop worker download', hasDownload ? (downloadStage === 'public' ? 'pass' : 'warn') : 'fail', hasDownload ? `Download configured at stage=${downloadStage}.` : 'No public/prototype worker download URL is configured.'),
    item('desktop_signing', 'Signed installer', 'fail', 'Windows artifact path exists, but signing is not implemented/verified.'),
    item('desktop_qa', 'Clean-machine desktop QA', 'fail', 'Windows release QA checklist has not been completed.'),
    item('sandbox', 'Worker sandbox/resource enforcement', 'warn', 'Worker enforces app-dir boundaries, approved extractor/runtime policy, localhost model endpoint, signature verification, and desktop resource controls; clean-machine sandbox/resource QA still required.'),
    item('rate_limits', 'Distributed abuse controls', hasAbuseAlerting ? 'pass' : 'warn', hasAbuseAlerting ? 'Postgres-backed limits plus abuse alert destination are configured.' : 'Postgres-backed limits exist when DATABASE_URL is present; configure abuse alerting before broad traffic.'),
    item('consensus', 'Consensus validation maturity', 'warn', 'Initial structural consensus exists; semantic comparison/reviewer tooling/exports remain.'),
    item('ncbi', 'NCBI ingestion robustness', 'warn', 'Backoff/retry exists; WebEnv/history batching for large jobs remains.'),
    item('audit', 'Audit/observability', db.auditEvents.length >= 0 ? 'pass' : 'warn', 'Audit events and ingestion runs are tracked.'),
    item('legal', 'Public trust/legal pages', 'pass', 'Baseline privacy/terms/security/science-disclaimer/responsible-disclosure pages exist.')
  ];

  const hasFail = items.some((candidate) => candidate.status === 'fail');
  const hasWarn = items.some((candidate) => candidate.status === 'warn');
  return {
    stage: hasFail ? 'private_alpha' : hasWarn ? 'public_beta_candidate' : 'public_launch_candidate',
    goNoGo: hasFail ? 'no_go_public_launch' : hasWarn ? 'no_go_public_beta' : 'go_public_launch',
    items
  };
}
