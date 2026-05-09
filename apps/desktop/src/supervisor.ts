import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
    schedule: 'always' | 'idle-only' | 'manual';
  };
  modelRuntime?: {
    qualityMode?: 'balanced' | 'high' | 'ultra' | 'custom';
    numCtx?: number;
    numPredict?: number;
  };
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
      lastExitedAt: this.lastExitedAt
    };
  }

  buildArgs(command: WorkerCommand): string[] {
    const args = [this.config.workerEntry, command.kind, '--server', this.config.coordinatorUrl];

    const controls = this.config.resourceControls;
    if (controls && (command.kind === 'run-once' || command.kind === 'loop')) {
      args.push('--idle-mode', controls.schedule === 'always' ? 'cpu-only' : controls.idleMode);
      args.push('--min-idle-seconds', String(controls.schedule === 'always' ? 0 : controls.minIdleSeconds));
      args.push('--max-cpu-percent', String(controls.maxCpuPercent));
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
      args.push('--node-id', this.config.nodeId, '--node-token', this.config.nodeToken);
    }

    return args;
  }

  private workerEnv(): NodeJS.ProcessEnv {
    const workerDir = path.dirname(path.dirname(this.config.workerEntry));
    const publicKeyPath = path.join(workerDir, 'config', 'packet-signing-public-key.pem');
    const keyIdPath = path.join(workerDir, 'config', 'packet-signing-key-id.txt');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OPENCAUSE_APP_DIR: this.config.appDir,
      ...(this.config.enrollmentCode ? { NODE_ENROLLMENT_CODE: this.config.enrollmentCode } : {})
    };
    if (existsSync(publicKeyPath)) env.PACKET_SIGNING_PUBLIC_KEY = readFileSync(publicKeyPath, 'utf8');
    if (existsSync(keyIdPath)) env.PACKET_SIGNING_KEY_ID = readFileSync(keyIdPath, 'utf8').trim();
    const qualityMode = this.config.modelRuntime?.qualityMode ?? 'high';
    env.LOCAL_LLM_NUM_CTX = String(this.config.modelRuntime?.numCtx ?? (qualityMode === 'ultra' ? 12288 : qualityMode === 'balanced' ? 4096 : 8192));
    env.LOCAL_LLM_NUM_PREDICT = String(this.config.modelRuntime?.numPredict ?? (qualityMode === 'ultra' ? 1600 : qualityMode === 'balanced' ? 900 : 1200));
    env.LOCAL_LLM_TEMPERATURE = '0';
    env.LOCAL_LLM_TOP_P = '0.9';
    env.LOCAL_LLM_QUALITY_TIER = qualityMode === 'ultra' ? 'ultra' : qualityMode === 'balanced' ? 'balanced' : 'high';
    return env;
  }

  startLoop(options: { forceNow?: boolean } = {}): WorkerRuntimeStatus {
    if (this.child && !this.child.killed) return this.status();
    const [entry, ...args] = this.buildArgs(options.forceNow ? { kind: 'run-once', forceNow: true } : { kind: 'loop' });
    this.lastMode = options.forceNow ? 'run-once' : 'loop';
    this.lastStartedAt = new Date().toISOString();
    this.lastExitedAt = undefined;
    this.lastExitCode = undefined;
    this.lastError = undefined;
    this.child = spawn(process.execPath, [entry, ...args], { env: this.workerEnv() });
    this.child.stdout.on('data', (chunk) => { void this.appendWorkerLog(chunk.toString().trimEnd()); });
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
    await writeFile(path.join(this.config.appDir, 'worker.log'), `[${new Date().toISOString()}] ${message}\n`, { flag: 'a', encoding: 'utf8' }).catch(() => undefined);
  }

  async writeRegistrationDebugLog(data: { code: number | null; stdout: string; stderr: string; message: string; error?: string }): Promise<void> {
    await mkdir(this.config.appDir, { recursive: true });
    await writeFile(
      path.join(this.config.appDir, 'registration-debug.log'),
      JSON.stringify({ ...data, workerEntry: this.config.workerEntry, coordinatorUrl: this.config.coordinatorUrl, at: new Date().toISOString() }, null, 2),
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
          capabilities: ['local-llm-v1'],
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
      if (profileSetupUrl) await this.appendWorkerLog(`profile setup ${profileSetupUrl}`);
      const message = 'Worker registered.';
      await this.writeRegistrationDebugLog({ code: 0, stdout: text, stderr: '', message });
      return { code: 0, stdout: text, stderr: '', message, profileSetupUrl };
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
    return content.length <= maxBytes ? content : content.slice(content.length - maxBytes);
  }

  async tailLogNewestFirst(maxBytes = 16_384): Promise<string> {
    const content = await this.tailLog(maxBytes);
    return content.split(/\r?\n/).filter(Boolean).reverse().join('\n');
  }

  async registrationDebugLog(maxBytes = 16_384): Promise<string> {
    const content = await readFile(path.join(this.config.appDir, 'registration-debug.log'), 'utf8').catch(() => '');
    return content.length <= maxBytes ? content : content.slice(content.length - maxBytes);
  }

  async uninstallLocalState(): Promise<WorkerRuntimeStatus> {
    this.stop();
    await rm(this.config.appDir, { recursive: true, force: true });
    return this.status();
  }
}
