import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { redactSensitive } from './redaction.js';

export type WorkerSupervisorConfig = {
  workerEntry: string;
  appDir: string;
  coordinatorUrl: string;
  enrollmentCode?: string;
  nodeId?: string;
  nodeToken?: string;
  intervalMs?: number;
  resourceControls?: {
    idleMode: 'user-and-cpu' | 'cpu-only';
    minIdleSeconds: number;
    maxCpuPercent: number;
    runOnBattery?: boolean;
    schedule: 'always' | 'idle-only' | 'manual';
  };
  modelRuntime?: {
    qualityMode?: 'budget' | 'balanced' | 'high' | 'ultra' | 'custom';
    numCtx?: number;
    numPredict?: number;
  };
};

export type WorkerSessionStats = {
  submitted: number;
  failures: number;
  claims: number;
  successRatePercent: number | null;
  averageSecondsPerSubmittedPacket: number | null;
};

export type WorkerRuntimeStatus = {
  configured: boolean;
  registered: boolean;
  running: boolean;
  appDir: string;
  logPath: string;
  credentialsPath: string;
  pid?: number;
  lastExitCode?: number | null;
  lastError?: string;
  lastMode?: 'loop' | 'run-once';
  lastStartedAt?: string;
  lastExitedAt?: string;
  runStartedAt?: string;
  packetsCompletedThisRun: number;
  stats: WorkerSessionStats;
};

export type WorkerTimelineEvent = { at?: string; kind: string; label: string; detail: string; severity: 'ready' | 'warning' | 'blocked'; packetId?: string };

export type WorkerActivitySummary = {
  state: 'running_model' | 'waiting_idle' | 'no_work' | 'submitted' | 'failed' | 'heartbeat' | 'idle' | 'unknown';
  headline: string;
  detail: string;
  severity: 'ready' | 'warning' | 'blocked';
  at?: string;
  packetId?: string;
  error?: string;
};

export type WorkerCommand =
  | { kind: 'register'; enrollmentCode: string }
  | { kind: 'run-once'; forceNow?: boolean }
  | { kind: 'loop'; intervalMs?: number }
  | { kind: 'status' }
  | { kind: 'uninstall-local-state' };

export class WorkerSupervisor {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lastExitCode: number | null | undefined;
  private lastError: string | undefined;
  private lastMode: 'loop' | 'run-once' | undefined;
  private lastStartedAt: string | undefined;
  private lastExitedAt: string | undefined;
  private runStartedAt: string | undefined;
  private packetsCompletedThisRun = 0;

  constructor(private readonly config: WorkerSupervisorConfig) {}

  status(): WorkerRuntimeStatus {
    return {
      configured: existsSync(this.config.workerEntry),
      registered: existsSync(path.join(this.config.appDir, 'node.json')),
      running: Boolean(this.child && !this.child.killed),
      appDir: this.config.appDir,
      logPath: path.join(this.config.appDir, 'worker.log'),
      credentialsPath: path.join(this.config.appDir, 'node.json'),
      pid: this.child?.pid,
      lastExitCode: this.lastExitCode,
      lastError: this.lastError,
      lastMode: this.lastMode,
      lastStartedAt: this.lastStartedAt,
      lastExitedAt: this.lastExitedAt,
      runStartedAt: this.runStartedAt,
      packetsCompletedThisRun: this.packetsCompletedThisRun,
      stats: this.sessionStats()
    };
  }

  buildArgs(command: WorkerCommand): string[] {
    const args = [this.config.workerEntry, command.kind, '--server', this.config.coordinatorUrl];

    const controls = this.config.resourceControls;
    if (controls && (command.kind === 'run-once' || command.kind === 'loop')) {
      args.push('--idle-mode', controls.schedule === 'always' ? 'cpu-only' : controls.idleMode);
      args.push('--min-idle-seconds', String(controls.schedule === 'always' ? 0 : controls.minIdleSeconds));
      args.push('--max-cpu-percent', String(controls.maxCpuPercent));
      args.push('--run-on-battery', String(Boolean(controls.runOnBattery)));
    }

    if (command.kind === 'register') {
      args.push('--enrollment-code', command.enrollmentCode);
    }
    if (command.kind === 'loop') {
      args.push('--interval-ms', String(command.intervalMs ?? this.config.intervalMs ?? 5000));
    }
    if (command.kind === 'run-once' && command.forceNow) {
      args.push('--force-now', 'true');
    }
    if (this.config.nodeId && this.config.nodeToken && (command.kind === 'run-once' || command.kind === 'loop')) {
      args.push('--node-id', this.config.nodeId);
    }

    return args;
  }

  private sessionStats(): WorkerSessionStats {
    const content = existsSync(path.join(this.config.appDir, 'worker.log')) ? readFileSync(path.join(this.config.appDir, 'worker.log'), 'utf8') : '';
    const since = this.runStartedAt ? new Date(this.runStartedAt).getTime() : 0;
    const lines = content.split(/\r?\n/).filter(Boolean).filter((line) => {
      const match = line.match(/^\[([^\]]+)\]/);
      return !since || (match ? new Date(match[1]).getTime() >= since : true);
    });
    const submitted = lines.filter((line) => line.includes('submitted result')).length;
    const failures = lines.filter((line) => line.includes('run failed') || line.includes('reported failed claim packet')).length;
    const claims = lines.filter((line) => line.includes('claimed packet')).length;
    const successRatePercent = submitted + failures > 0 ? Math.round((submitted / (submitted + failures)) * 100) : null;
    const averageSecondsPerSubmittedPacket = submitted > 0 && this.runStartedAt ? Math.round((Date.now() - new Date(this.runStartedAt).getTime()) / 1000 / submitted) : null;
    return { submitted, failures, claims, successRatePercent, averageSecondsPerSubmittedPacket };
  }

  private workerEnv(): NodeJS.ProcessEnv {
    const workerDir = path.dirname(path.dirname(this.config.workerEntry));
    const configDirs = [
      path.join(workerDir, 'config'),
      path.join(process.resourcesPath ?? '', 'worker', 'config'),
      path.join(path.dirname(this.config.workerEntry), '..', 'config'),
      path.join(process.cwd(), 'static', 'config')
    ];
    const publicKeyPath = configDirs.map((dir) => path.join(dir, 'packet-signing-public-key.pem')).find((candidate) => existsSync(candidate));
    const keyIdPath = configDirs.map((dir) => path.join(dir, 'packet-signing-key-id.txt')).find((candidate) => existsSync(candidate));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OPENCAUSE_APP_DIR: this.config.appDir,
      ...(this.config.enrollmentCode ? { NODE_ENROLLMENT_CODE: this.config.enrollmentCode } : {}),
      ...(this.config.nodeToken ? { NODE_TOKEN: this.config.nodeToken } : {})
    };
    if (publicKeyPath) env.PACKET_SIGNING_PUBLIC_KEY = readFileSync(publicKeyPath, 'utf8');
    if (keyIdPath) env.PACKET_SIGNING_KEY_ID = readFileSync(keyIdPath, 'utf8').trim();
    void this.appendWorkerLog(publicKeyPath ? `packet signing public key loaded keyId=${env.PACKET_SIGNING_KEY_ID ?? 'unknown'}` : 'packet signing public key missing');
    const qualityMode = this.config.modelRuntime?.qualityMode ?? 'balanced';
    env.LOCAL_LLM_NUM_CTX = String(this.config.modelRuntime?.numCtx ?? (qualityMode === 'ultra' ? 32768 : qualityMode === 'high' ? 24576 : qualityMode === 'budget' ? 12288 : 16384));
    env.LOCAL_LLM_NUM_PREDICT = String(this.config.modelRuntime?.numPredict ?? 5000);
    env.LOCAL_LLM_TIMEOUT_MS = '300000';
    env.LOCAL_LLM_TEMPERATURE = '0';
    env.LOCAL_LLM_TOP_P = '0.9';
    env.LOCAL_LLM_QUALITY_TIER = qualityMode === 'ultra' ? 'ultra' : qualityMode === 'high' ? 'high' : 'balanced';
    return env;
  }

  startLoop(options: { forceNow?: boolean } = {}): WorkerRuntimeStatus {
    if (this.child && !this.child.killed) return this.status();
    const [entry, ...args] = this.buildArgs(options.forceNow ? { kind: 'run-once', forceNow: true } : { kind: 'loop' });
    this.lastMode = options.forceNow ? 'run-once' : 'loop';
    this.lastStartedAt = new Date().toISOString();
    this.runStartedAt = this.lastStartedAt;
    this.packetsCompletedThisRun = 0;
    this.lastExitedAt = undefined;
    this.lastExitCode = undefined;
    this.lastError = undefined;
    this.child = spawn(process.execPath, [entry, ...args], { env: this.workerEnv() });
    this.child.stdout.on('data', (chunk) => {
      const text = chunk.toString().trimEnd();
      if (text.includes('submitted result')) this.packetsCompletedThisRun += (text.match(/submitted result/g) ?? []).length;
      // The worker process writes its own timestamped lines to worker.log. The
      // desktop supervisor also receives those lines on stdout, so appending
      // them again here duplicates timeline entries. Only append stdout that is
      // not already a worker-formatted log line.
      const unloggedLines = text.split(/\r?\n/).filter((line: string) => line && !/^\[\d{4}-\d{2}-\d{2}T/.test(line));
      if (unloggedLines.length) void this.appendWorkerLog(unloggedLines.join('\n'));
    });
    this.child.stderr.on('data', (chunk) => { void this.appendWorkerLog(`stderr ${chunk.toString().trimEnd()}`); });
    this.child.on('error', (error) => { this.lastError = error.message; void this.appendWorkerLog(`spawn error ${error.message}`); });
    this.child.on('close', (code) => {
      this.lastExitCode = code;
      this.lastExitedAt = new Date().toISOString();
      void this.appendWorkerLog(`worker process exited code=${code ?? 'unknown'}`);
      this.child = null;
    });
    return this.status();
  }

  async readCredentials(): Promise<{ nodeId?: string; nodeToken?: string; profileSetupUrl?: string } | null> {
    try {
      return JSON.parse(await readFile(path.join(this.config.appDir, 'node.json'), 'utf8')) as { nodeId?: string; nodeToken?: string; profileSetupUrl?: string };
    } catch {
      return null;
    }
  }

  async saveCredentials(credentials: { nodeId: string; nodeToken: string; profileSetupToken?: string; profileSetupUrl?: string }): Promise<void> {
    await mkdir(this.config.appDir, { recursive: true });
    await writeFile(path.join(this.config.appDir, 'node.json'), JSON.stringify(credentials, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  async appendWorkerLog(message: string): Promise<void> {
    await mkdir(this.config.appDir, { recursive: true });
    await writeFile(path.join(this.config.appDir, 'worker.log'), `[${new Date().toISOString()}] ${redactSensitive(message)}\n`, { flag: 'a', encoding: 'utf8' }).catch(() => undefined);
  }

  async writeRegistrationDebugLog(data: { code: number | null; stdout: string; stderr: string; message: string; error?: string }): Promise<void> {
    await mkdir(this.config.appDir, { recursive: true });
    await writeFile(
      path.join(this.config.appDir, 'registration-debug.log'),
      JSON.stringify({ ...data, stdout: redactSensitive(data.stdout), stderr: redactSensitive(data.stderr), message: redactSensitive(data.message), error: data.error ? redactSensitive(data.error) : undefined, workerEntry: this.config.workerEntry, coordinatorUrl: this.config.coordinatorUrl, at: new Date().toISOString() }, null, 2),
      'utf8'
    ).catch(() => undefined);
  }

  register(enrollmentCode: string): Promise<{ code: number | null; stdout: string; stderr: string; message: string; profileSetupUrl?: string }> {
    return this.registerDirect(enrollmentCode);
  }

  async registerDirect(enrollmentCode: string): Promise<{ code: number | null; stdout: string; stderr: string; message: string; profileSetupUrl?: string }> {
    try {
      const response = await fetch(`${this.config.coordinatorUrl.replace(/\/$/, '')}/api/nodes/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nodeName: `${os.hostname()}-worker`,
          platform: `${process.platform}-${process.arch}`,
          version: process.env.WORKER_VERSION ?? '0.1.0',
          capabilities: ['local-llm-v2', 'local-llm-v1'],
          enrollmentCode
        })
      });
      const text = await response.text();
      let body: { node?: { id?: string }; nodeToken?: string; profileSetupToken?: string; error?: string; message?: string } = {};
      try { body = JSON.parse(text); } catch {}
      if (!response.ok || !body.node?.id || !body.nodeToken) {
        const message = body.message || body.error || `Registration failed with HTTP ${response.status}.`;
        await this.writeRegistrationDebugLog({ code: response.status, stdout: text, stderr: '', message });
        return { code: response.status, stdout: text, stderr: '', message };
      }
      const profileSetupUrl = body.profileSetupToken ? `${this.config.coordinatorUrl.replace(/\/$/, '')}/volunteer/profile?token=${encodeURIComponent(body.profileSetupToken)}` : undefined;
      await this.saveCredentials({ nodeId: body.node.id, nodeToken: body.nodeToken, profileSetupToken: body.profileSetupToken, profileSetupUrl });
      await this.appendWorkerLog(`registered node ${body.node.id}`);
      if (profileSetupUrl) await this.appendWorkerLog('profile setup link issued');
      const message = 'Worker registered.';
      await this.writeRegistrationDebugLog({ code: 0, stdout: '', stderr: '', message });
      return { code: 0, stdout: '', stderr: '', message, profileSetupUrl };
    } catch (error) {
      const message = `Registration failed before contacting coordinator: ${error instanceof Error ? error.message : String(error)}`;
      await this.writeRegistrationDebugLog({ code: 1, stdout: '', stderr: String(error), message });
      return { code: 1, stdout: '', stderr: String(error), message };
    }
  }

  registerViaWorkerProcess(enrollmentCode: string): Promise<{ code: number | null; stdout: string; stderr: string; message: string; profileSetupUrl?: string }> {
    const [entry, ...args] = this.buildArgs({ kind: 'register', enrollmentCode });
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [entry, ...args], {
        env: this.workerEnv(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('close', async (code) => {
        const credentials = await this.readCredentials();
        const text = `${stderr}\n${stdout}`;
        const match = text.match(/http_(\d+):({.*})/s);
        let message = code === 0 ? 'Worker registered.' : `Registration failed with exit code ${code ?? 'unknown'}.`;
        if (match) {
          try {
            const body = JSON.parse(match[2]) as { error?: string; message?: string };
            message = body.message || body.error || message;
          } catch {}
        } else if (text.trim()) {
          message = text.trim().split(/\r?\n/).at(-1) ?? message;
        }
        await this.writeRegistrationDebugLog({ code, stdout, stderr, message });
        resolve({ code, stdout, stderr, message, profileSetupUrl: credentials?.profileSetupUrl });
      });
      child.on('error', async (error) => {
        const message = `Registration worker could not start: ${error.message}`;
        await this.writeRegistrationDebugLog({ code: 1, stdout, stderr, message, error: error.message });
        resolve({ code: 1, stdout, stderr: error.message, message });
      });
    });
  }

  stop(): WorkerRuntimeStatus {
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
    }
    return this.status();
  }

  async tailLog(maxBytes = 16_384): Promise<string> {
    const logPath = path.join(this.config.appDir, 'worker.log');
    const content = await readFile(logPath, 'utf8').catch(() => '');
    const redacted = redactSensitive(content);
    return redacted.length <= maxBytes ? redacted : redacted.slice(redacted.length - maxBytes);
  }

  async tailLogNewestFirst(maxBytes = 16_384): Promise<string> {
    const content = await this.tailLog(maxBytes);
    return content.split(/\r?\n/).filter(Boolean).reverse().join('\n');
  }

  async activitySummary(): Promise<WorkerActivitySummary> {
    return summarizeWorkerLog(await this.tailLog(), this.runStartedAt);
  }

  async activityTimeline(): Promise<WorkerTimelineEvent[]> {
    return buildActivityTimeline(await this.tailLog(32_768), this.runStartedAt);
  }

  async registrationDebugLog(maxBytes = 16_384): Promise<string> {
    const content = await readFile(path.join(this.config.appDir, 'registration-debug.log'), 'utf8').catch(() => '');
    const redacted = redactSensitive(content);
    return redacted.length <= maxBytes ? redacted : redacted.slice(redacted.length - maxBytes);
  }

  async uninstallLocalState(userDataDir?: string): Promise<WorkerRuntimeStatus> {
    this.stop();
    const target = path.resolve(this.config.appDir);
    if (path.basename(target) !== 'opencause-worker') throw new Error('unsafe_uninstall_path');
    if (target === path.parse(target).root || target === os.homedir()) throw new Error('unsafe_uninstall_path');
    if (userDataDir) {
      const allowedParent = path.resolve(userDataDir);
      const relative = path.relative(allowedParent, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('unsafe_uninstall_path');
    }
    await rm(target, { recursive: true, force: true });
    return this.status();
  }
}

function humanReason(reason: string): string {
  if (reason === 'node_offline') return 'The coordinator had marked this worker offline after missed heartbeats. The worker will reconnect automatically when heartbeats succeed.';
  if (reason === 'user_not_idle') return 'Waiting for you to be away from the computer.';
  if (reason === 'high_cpu') return 'Waiting for CPU usage to settle.';
  if (reason === 'on_battery') return 'Waiting for AC power.';
  if (reason === 'user_idle_unavailable') return 'Waiting because idle detection is unavailable.';
  return reason.replace(/_/g, ' ');
}

function isAtOrAfter(value: string | undefined, sinceIso?: string): boolean {
  if (!sinceIso || !value) return true;
  return new Date(value).getTime() >= new Date(sinceIso).getTime();
}

export function buildActivityTimeline(content: string, sinceIso?: string): WorkerTimelineEvent[] {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const events = lines.map<WorkerTimelineEvent | null>((line) => {
    const match = line.match(/^\[([^\]]+)\]\s+(?:\[[^\]]+\]\s+)?(.+)$/);
    const at = match?.[1];
    if (!isAtOrAfter(at, sinceIso)) return null;
    const message = match?.[2] ?? line;
    if (message.includes('claimed packet')) { const id = message.match(/claimed packet\s+([^\s]+)/)?.[1]; return { at, kind: 'claiming_work', label: 'Claimed work', detail: id ? `Packet ${id.slice(0, 8)} claimed.` : 'Packet claimed.', severity: 'ready', packetId: id }; }
    if (message.includes('signature verified')) return { at, kind: 'verifying_signature', label: 'Verified packet signature', detail: 'The packet passed authenticity checks.', severity: 'ready' };
    if (message.includes('local llm progress')) { const id = message.match(/local llm progress packet\s+([^\s]+)/)?.[1]; return { at, kind: 'running_model', label: 'Ollama is generating', detail: message.replace(/^local llm progress packet\s+[^\s]+\s+/, ''), severity: 'ready', packetId: id }; }
    if (message.includes('submitted result')) return { at, kind: 'submitting_result', label: 'Submitted result', detail: 'The local result was sent to the coordinator.', severity: 'ready' };
    if (message.includes('reported released claim')) return { at, kind: 'claim_released', label: 'Released claim', detail: message, severity: 'warning' };
    if (message.includes('generation cancelled')) return { at, kind: 'claim_released', label: 'Released because resource policy changed', detail: message, severity: 'warning' };
    if (message.includes('battery policy')) return { at, kind: 'blocked_battery', label: 'Waiting for AC power', detail: message, severity: 'warning' };
    if (message.includes('reported failed claim')) return { at, kind: 'claim_failed', label: 'Reported failed claim', detail: message, severity: 'warning' };
    if (message.includes('idle gate blocked')) { const reason = message.match(/reason=([^\s]+)/)?.[1] ?? 'resource settings'; return { at, kind: 'blocked_resources', label: 'Waiting for resources', detail: humanReason(reason), severity: 'warning' }; }
    if (message.includes('run failed') || message.includes('fatal ') || message.includes('loop error')) {
      const rawReason = message.replace(/^run failed\s+/, '').replace(/^fatal\s+/, '').replace(/^loop error\s+/, '');
      return { at, kind: 'worker_error', label: 'Worker error', detail: humanReason(rawReason), severity: rawReason === 'node_offline' ? 'warning' : 'blocked' };
    }
    if (message.includes('no work available')) return { at, kind: 'no_work', label: 'No work available', detail: message, severity: 'warning' };
    if (message.includes('heartbeat')) return null;
    return { at, kind: 'log', label: 'Worker log', detail: message, severity: 'warning' };
  }).filter((event): event is WorkerTimelineEvent => Boolean(event));
  const deduped: WorkerTimelineEvent[] = [];
  for (const event of events.reverse()) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.kind === event.kind && prev.detail === event.detail) continue;
    if (event.kind === 'running_model' && deduped.some((existing) => existing.kind === 'running_model' && existing.packetId === event.packetId)) continue;
    deduped.push(event);
    if (deduped.length >= 6) break;
  }
  return deduped;
}


export function summarizeWorkerLog(content: string, sinceIso?: string): WorkerActivitySummary {
  const lines = content.split(/\r?\n/).filter(Boolean);
  const parsed = lines.map((line) => {
    const match = line.match(/^\[([^\]]+)\]\s+(?:\[[^\]]+\]\s+)?(.+)$/);
    return { at: match?.[1], message: match?.[2] ?? line };
  }).filter((entry) => isAtOrAfter(entry.at, sinceIso));

  const latest = [...parsed].reverse().find((entry) => !entry.message.startsWith('worker process exited'));
  const latestClaim = [...parsed].reverse().find((entry) => entry.message.includes('claimed packet'));
  const latestSignatureVerified = [...parsed].reverse().find((entry) => entry.message.includes('signature verified'));
  const latestSubmitted = [...parsed].reverse().find((entry) => entry.message.includes('submitted result'));
  const latestProgress = [...parsed].reverse().find((entry) => entry.message.includes('local llm progress'));
  const latestFailure = [...parsed].reverse().find((entry) => entry.message.includes('run failed') || entry.message.includes('fatal ') || entry.message.includes('loop error'));
  const latestIdleBlock = [...parsed].reverse().find((entry) => entry.message.includes('idle gate blocked'));
  const latestFailedReport = [...parsed].reverse().find((entry) => entry.message.includes('reported failed claim packet'));
  const latestReleasedReport = [...parsed].reverse().find((entry) => entry.message.includes('reported released claim packet'));
  const packetId = latestClaim?.message.match(/claimed packet\s+([^\s]+)/)?.[1];

  const latestTerminalAt = [latestSubmitted, latestFailure, latestFailedReport, latestReleasedReport]
    .map((entry) => entry?.at ?? '')
    .sort()
    .at(-1) ?? '';

  if (latestProgress && (latestProgress.at ?? '') >= latestTerminalAt) {
    const chars = latestProgress.message.match(/chars=(\d+)/)?.[1];
    const chunks = latestProgress.message.match(/chunks=(\d+)/)?.[1];
    const tokens = latestProgress.message.match(/tokens=(\d+)/)?.[1];
    return {
      state: 'running_model',
      headline: latestProgress.message.includes(' done ') ? 'Ollama finished generating; validating output' : 'Ollama is generating packet output',
      detail: `Packet ${packetId ?? 'claimed'} is active.${chars ? ` Response chars: ${chars}.` : ''}${chunks ? ` Stream chunks: ${chunks}.` : ''}${tokens ? ` Tokens: ${tokens}.` : ''}`,
      severity: 'ready',
      at: latestProgress.at,
      packetId
    };
  }
  if (latestSignatureVerified && (latestSignatureVerified.at ?? '') >= latestTerminalAt) {
    return {
      state: 'running_model',
      headline: 'Running local model on a claimed packet',
      detail: packetId ? `Packet ${packetId} is claimed and the local model is generating evidence.` : 'A packet is claimed and the local model is generating evidence.',
      severity: 'ready',
      at: latestSignatureVerified.at,
      packetId
    };
  }
  if (latestIdleBlock && (!latestSubmitted || (latestIdleBlock.at ?? '') > (latestSubmitted.at ?? '')) && (!latestFailure || (latestIdleBlock.at ?? '') > (latestFailure.at ?? ''))) {
    const reason = latestIdleBlock.message.match(/reason=([^\s]+)/)?.[1] ?? 'resource settings';
    return { state: 'waiting_idle', headline: 'Waiting for this computer to be ready', detail: humanReason(reason), severity: 'warning', at: latestIdleBlock.at };
  }
  if (latestReleasedReport && (!latestSubmitted || (latestReleasedReport.at ?? '') > (latestSubmitted.at ?? ''))) {
    const packetIdFromReport = latestReleasedReport.message.match(/reported released claim packet\s+([^\s]+)/)?.[1];
    return { state: 'waiting_idle', headline: 'Released a claim without marking worker failure', detail: 'The worker gave the packet back because local resource or policy checks changed after claim.', severity: 'warning', at: latestReleasedReport.at, packetId: packetIdFromReport ?? packetId };
  }
  if (latestFailedReport && (!latestSubmitted || (latestFailedReport.at ?? '') > (latestSubmitted.at ?? ''))) {
    const packetIdFromReport = latestFailedReport.message.match(/reported failed claim packet\s+([^\s]+)/)?.[1];
    return {
      state: 'failed',
      headline: 'Skipped a packet after repeated local failures',
      detail: 'The worker reported the repeated packet failure to the coordinator and will move on to another eligible packet.',
      severity: 'warning',
      at: latestFailedReport.at,
      packetId: packetIdFromReport ?? packetId
    };
  }
  if (latestFailure && (!latestSubmitted || (latestFailure.at ?? '') > (latestSubmitted.at ?? ''))) {
    const error = latestFailure.message.replace(/^run failed\s+/, '').replace(/^fatal\s+/, '').replace(/^loop error\s+/, '');
    return {
      state: 'failed',
      headline: error === 'node_offline' ? 'Reconnecting to coordinator' : error.startsWith('local_llm_timeout') ? 'Local model timed out before submitting' : 'Worker hit an error before submitting',
      detail: error.startsWith('local_llm_timeout')
        ? 'The coordinator has work and the worker can claim it, but the local model timed out after the current model timeout. Try the default small model, lower quality mode, or run one packet now after closing heavy apps.'
        : humanReason(error),
      severity: error === 'node_offline' ? 'warning' : 'blocked',
      at: latestFailure.at,
      packetId,
      error
    };
  }
  if (latest?.message.includes('no work available')) {
    return { state: 'no_work', headline: 'Coordinator has no eligible packets for this worker', detail: 'The worker checked in successfully but did not receive a packet.', severity: 'warning', at: latest.at };
  }
  if (latestSubmitted) {
    return { state: 'submitted', headline: 'Packet submitted successfully', detail: latestSubmitted.message, severity: 'ready', at: latestSubmitted.at };
  }
  if (latest?.message.includes('heartbeat')) {
    return { state: 'heartbeat', headline: 'Connected to coordinator', detail: 'Heartbeat succeeded. Waiting for the next work check.', severity: 'ready', at: latest.at };
  }
  return { state: 'unknown', headline: 'No worker activity yet', detail: latest?.message ?? 'Start the worker to begin heartbeats, packet claims, and submissions.', severity: 'warning', at: latest?.at };
}
