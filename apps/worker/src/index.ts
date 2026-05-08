import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runMockExtractorV1, verifyPayloadHmac, type ResultPayload, type WorkPacketPayload } from '@opencause/shared';
import { checkHostIdle, type IdleConfig, type IdleMode } from './idle';

type JsonValue = Record<string, unknown>;

const DEFAULT_SERVER = process.env.COORDINATOR_URL ?? 'http://localhost:3000';
const SIGNING_SECRET = process.env.SIGNING_SECRET ?? 'opencause-dev-signing-secret-v1';
const APP_DIR = process.env.OPENCAUSE_APP_DIR ?? path.join(os.homedir(), '.opencause-compute');
const LOG_PATH = path.join(APP_DIR, 'worker.log');

async function log(message: string): Promise<void> {
  await mkdir(APP_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(LOG_PATH, line, 'utf8');
  process.stdout.write(line);
}

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) {
    return fallback;
  }
  return process.argv[idx + 1] ?? fallback;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`missing_arg:${name}`);
  }
  return value;
}

function readIdleConfig(): IdleConfig {
  const modeValue = arg('--idle-mode', process.env.IDLE_MODE ?? 'user-and-cpu');
  const mode: IdleMode = modeValue === 'cpu-only' ? 'cpu-only' : 'user-and-cpu';

  const minIdleSeconds = Number(arg('--min-idle-seconds', process.env.MIN_IDLE_SECONDS ?? '120'));
  const maxCpuPercent = Number(arg('--max-cpu-percent', process.env.MAX_CPU_PERCENT ?? '35'));
  const sampleMs = Number(arg('--cpu-sample-ms', process.env.CPU_SAMPLE_MS ?? '800'));

  return {
    mode,
    minIdleSeconds: Number.isFinite(minIdleSeconds) ? minIdleSeconds : 120,
    maxCpuPercent: Number.isFinite(maxCpuPercent) ? maxCpuPercent : 35,
    sampleMs: Number.isFinite(sampleMs) ? sampleMs : 800
  };
}

async function post<T>(server: string, route: string, body: JsonValue): Promise<T> {
  const response = await fetch(`${server}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const json = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`http_${response.status}:${JSON.stringify(json)}`);
  }
  return json;
}

async function register(server: string): Promise<string> {
  const nodeName = arg('--node-name', `${os.hostname()}-worker`) as string;
  const platform = `${process.platform}-${process.arch}`;
  const version = '0.1.0';

  const response = await post<{ node: { id: string } }>(server, '/api/nodes/register', {
    nodeName,
    platform,
    version,
    capabilities: ['mock-extractor-v1']
  });

  await log(`registered node ${response.node.id}`);
  return response.node.id;
}

async function heartbeat(server: string, nodeId: string): Promise<void> {
  await post(server, '/api/nodes/heartbeat', { nodeId });
  await log(`heartbeat ${nodeId}`);
}

async function claim(server: string, nodeId: string): Promise<
  | {
      claimId: string;
      packet: WorkPacketPayload;
      signature: string;
    }
  | null
> {
  const response = await post<
    | {
        claimId: string;
        packet: WorkPacketPayload;
        signature: string;
      }
    | { claim: null; message: string }
  >(server, '/api/work/claim', { nodeId });

  if ('claim' in response) {
    await log('no work available');
    return null;
  }

  await log(`claimed packet ${response.packet.id}`);
  return response;
}

async function submit(server: string, nodeId: string, claimId: string, packetId: string, result: ResultPayload): Promise<void> {
  const response = await post<{ result: { id: string; validated: boolean } }>(server, '/api/work/submit', {
    nodeId,
    claimId,
    workPacketId: packetId,
    result
  });

  await log(`submitted result ${response.result.id} validated=${response.result.validated}`);
}

async function runOnce(server: string, nodeId: string, idleConfig: IdleConfig): Promise<void> {
  await heartbeat(server, nodeId);

  const idleDecision = await checkHostIdle(idleConfig);
  if (!idleDecision.eligible) {
    const userIdle = idleDecision.metrics.userIdleSeconds === null ? 'n/a' : `${idleDecision.metrics.userIdleSeconds}s`;
    await log(
      `idle gate blocked run reason=${idleDecision.reason} cpu=${idleDecision.metrics.cpuPercent}% userIdle=${userIdle}`
    );
    return;
  }

  const claimed = await claim(server, nodeId);
  if (!claimed) {
    return;
  }

  const isValidSignature = verifyPayloadHmac(claimed.packet, claimed.signature, SIGNING_SECRET);
  if (!isValidSignature) {
    await log(`signature verification failed for packet ${claimed.packet.id}`);
    return;
  }

  await log(`signature verified for packet ${claimed.packet.id}`);
  const result = runMockExtractorV1(claimed.packet.sourceText);
  await submit(server, nodeId, claimed.claimId, claimed.packet.id, result);
}

async function loop(server: string, nodeId: string, intervalMs: number, idleConfig: IdleConfig): Promise<void> {
  await log(
    `loop started intervalMs=${intervalMs} idleMode=${idleConfig.mode} minIdleSeconds=${idleConfig.minIdleSeconds} maxCpuPercent=${idleConfig.maxCpuPercent}`
  );
  while (true) {
    try {
      await runOnce(server, nodeId, idleConfig);
    } catch (error) {
      await log(`loop error ${(error as Error).message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function main() {
  const command = process.argv[2] ?? 'run-once';
  const server = arg('--server', DEFAULT_SERVER) as string;
  const idleConfig = readIdleConfig();

  if (command === 'register') {
    await register(server);
    return;
  }

  if (command === 'heartbeat') {
    const nodeId = required(arg('--node-id'), '--node-id');
    await heartbeat(server, nodeId);
    return;
  }

  if (command === 'claim') {
    const nodeId = required(arg('--node-id'), '--node-id');
    await claim(server, nodeId);
    return;
  }

  if (command === 'run-once') {
    const nodeId = arg('--node-id') ?? (await register(server));
    await runOnce(server, nodeId, idleConfig);
    return;
  }

  if (command === 'loop') {
    const nodeId = arg('--node-id') ?? (await register(server));
    const intervalMs = Number(arg('--interval-ms', '5000'));
    await loop(server, nodeId, intervalMs, idleConfig);
    return;
  }

  throw new Error(`unknown_command:${command}`);
}

main().catch(async (error) => {
  await log(`fatal ${(error as Error).message}`);
  process.exit(1);
});
