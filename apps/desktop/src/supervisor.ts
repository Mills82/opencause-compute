import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
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
        OPENCAUSE_APP_DIR: this.config.appDir,
        ...(this.config.enrollmentCode ? { NODE_ENROLLMENT_CODE: this.config.enrollmentCode } : {})
      }
    });
    return this.status();
  }

  register(enrollmentCode: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const [entry, ...args] = this.buildArgs({ kind: 'register', enrollmentCode });
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [entry, ...args], {
        env: { ...process.env, OPENCAUSE_APP_DIR: this.config.appDir },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }));
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
