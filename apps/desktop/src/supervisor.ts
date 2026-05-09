import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
};

export type WorkerRuntimeStatus = {
  configured: boolean;
  registered: boolean;
  running: boolean;
  appDir: string;
  logPath: string;
  credentialsPath: string;
  pid?: number;
};

export type WorkerCommand =
  | { kind: 'register'; enrollmentCode: string }
  | { kind: 'run-once'; forceNow?: boolean }
  | { kind: 'loop'; intervalMs?: number }
  | { kind: 'status' }
  | { kind: 'uninstall-local-state' };

export class WorkerSupervisor {
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly config: WorkerSupervisorConfig) {}

  status(): WorkerRuntimeStatus {
    return {
      configured: existsSync(this.config.workerEntry),
      registered: existsSync(path.join(this.config.appDir, 'node.json')),
      running: Boolean(this.child && !this.child.killed),
      appDir: this.config.appDir,
      logPath: path.join(this.config.appDir, 'worker.log'),
      credentialsPath: path.join(this.config.appDir, 'node.json'),
      pid: this.child?.pid
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

  startLoop(): WorkerRuntimeStatus {
    if (this.child && !this.child.killed) return this.status();
    const [entry, ...args] = this.buildArgs({ kind: 'loop' });
    this.child = spawn(process.execPath, [entry, ...args], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        OPENCAUSE_APP_DIR: this.config.appDir,
        ...(this.config.enrollmentCode ? { NODE_ENROLLMENT_CODE: this.config.enrollmentCode } : {})
      }
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

  async writeRegistrationDebugLog(data: { code: number | null; stdout: string; stderr: string; message: string; error?: string }): Promise<void> {
    await mkdir(this.config.appDir, { recursive: true });
    await writeFile(
      path.join(this.config.appDir, 'registration-debug.log'),
      JSON.stringify({ ...data, workerEntry: this.config.workerEntry, coordinatorUrl: this.config.coordinatorUrl, at: new Date().toISOString() }, null, 2),
      'utf8'
    ).catch(() => undefined);
  }

  register(enrollmentCode: string): Promise<{ code: number | null; stdout: string; stderr: string; message: string; profileSetupUrl?: string }> {
    const [entry, ...args] = this.buildArgs({ kind: 'register', enrollmentCode });
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [entry, ...args], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', OPENCAUSE_APP_DIR: this.config.appDir },
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

  async uninstallLocalState(): Promise<WorkerRuntimeStatus> {
    this.stop();
    await rm(this.config.appDir, { recursive: true, force: true });
    return this.status();
  }
}
