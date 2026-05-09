import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  runMockExtractorV1,
  verifyPayloadHmac,
  type ResultPayload,
  type WorkPacketPayload,
  type WorkerControlConfig
} from '@opencause/shared';
import { checkHostIdle, type IdleConfig, type IdleMode } from './idle';
import { readLocalLlmConfig, runLocalLlmExtractor, verifyLocalLlmAvailable } from './local-llm';

type JsonValue = Record<string, unknown>;
type ExtractorMode = 'local-llm' | 'mock';
type ExtractorVersion = 'Local LLM v1' | 'Mock Extractor v1';

const DEFAULT_SERVER = process.env.COORDINATOR_URL ?? 'http://localhost:3000';
const SIGNING_SECRET = process.env.SIGNING_SECRET ?? 'opencause-dev-signing-secret-v1';
const APP_DIR = process.env.OPENCAUSE_APP_DIR ?? path.join(os.homedir(), '.opencause-compute');
const LOG_PATH = path.join(APP_DIR, 'worker.log');
const localLlmConfig = readLocalLlmConfig();

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

function readExtractorMode(): ExtractorMode {
  const value = arg('--extractor-mode', process.env.EXTRACTOR_MODE ?? 'local-llm');
  return value === 'mock' ? 'mock' : 'local-llm';
}

function allowMockExtractor(): boolean {
  return arg('--allow-mock-extractor', process.env.ALLOW_MOCK_EXTRACTOR ?? 'false') === 'true';
}

function enforceExtractorPolicy(mode: ExtractorMode, mockAllowed: boolean): void {
  if (mode === 'mock' && !mockAllowed) {
    throw new Error('mock_extractor_disabled');
  }
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

function toIdleConfigFromControl(config: WorkerControlConfig): IdleConfig {
  return {
    mode: config.idleMode,
    minIdleSeconds: config.minIdleSeconds,
    maxCpuPercent: config.maxCpuPercent,
    sampleMs: Number(arg('--cpu-sample-ms', process.env.CPU_SAMPLE_MS ?? '800'))
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

async function getControlConfig(server: string): Promise<WorkerControlConfig> {
  const response = await fetch(`${server}/api/worker/control`);
  const json = (await response.json()) as { config: WorkerControlConfig };
  if (!response.ok) {
    throw new Error(`http_${response.status}:${JSON.stringify(json)}`);
  }
  return json.config;
}

async function register(server: string, extractorMode: ExtractorMode): Promise<string> {
  const nodeName = arg('--node-name', `${os.hostname()}-worker`) as string;
  const platform = `${process.platform}-${process.arch}`;
  const version = '0.1.0';
  const capabilities = extractorMode === 'local-llm' ? ['local-llm-v1'] : ['mock-extractor-v1'];

  const response = await post<{ node: { id: string } }>(server, '/api/nodes/register', {
    nodeName,
    platform,
    version,
    capabilities
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

async function submit(
  server: string,
  nodeId: string,
  claimId: string,
  packetId: string,
  extractorVersion: ExtractorVersion,
  result: ResultPayload
): Promise<void> {
  const response = await post<{ result: { id: string; validated: boolean } }>(server, '/api/work/submit', {
    nodeId,
    claimId,
    workPacketId: packetId,
    extractorVersion,
    result
  });

  await log(`submitted result ${response.result.id} validated=${response.result.validated}`);
}

async function extractFromPacket(
  packet: WorkPacketPayload,
  extractorMode: ExtractorMode,
  mockAllowed: boolean
): Promise<{ extractorVersion: ExtractorVersion; result: ResultPayload }> {
  if (packet.extractor === 'mock-extractor-v1') {
    if (!mockAllowed || extractorMode !== 'mock') {
      throw new Error('mock_extractor_packet_rejected');
    }
    return {
      extractorVersion: 'Mock Extractor v1',
      result: runMockExtractorV1(packet.sourceText)
    };
  }

  if (extractorMode !== 'local-llm') {
    throw new Error('packet_requires_local_llm');
  }

  const result = await runLocalLlmExtractor(packet.sourceText, localLlmConfig);
  return {
    extractorVersion: 'Local LLM v1',
    result
  };
}

async function runOnce(
  server: string,
  nodeId: string,
  idleConfig: IdleConfig,
  extractorMode: ExtractorMode,
  mockAllowed: boolean,
  bypassIdleGate = false
): Promise<void> {
  if (!bypassIdleGate) {
    const idleDecision = await checkHostIdle(idleConfig);
    if (!idleDecision.eligible) {
      const userIdle = idleDecision.metrics.userIdleSeconds === null ? 'n/a' : `${idleDecision.metrics.userIdleSeconds}s`;
      await log(
        `idle gate blocked run reason=${idleDecision.reason} cpu=${idleDecision.metrics.cpuPercent}% userIdle=${userIdle}`
      );
      return;
    }
  } else {
    await log('run-now token received, bypassing idle gate for one packet');
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
  const extraction = await extractFromPacket(claimed.packet, extractorMode, mockAllowed);
  await submit(server, nodeId, claimed.claimId, claimed.packet.id, extraction.extractorVersion, extraction.result);
}

async function loop(
  server: string,
  nodeId: string,
  intervalMs: number,
  extractorMode: ExtractorMode,
  mockAllowed: boolean
): Promise<void> {
  await log(`loop started intervalMs=${intervalMs}`);
  let lastRunNowToken: number | null = null;

  while (true) {
    try {
      await heartbeat(server, nodeId);
      const controlConfig = await getControlConfig(server);
      const effectiveIdleConfig = toIdleConfigFromControl(controlConfig);
      const runNowRequested = lastRunNowToken !== null && controlConfig.runNowToken !== lastRunNowToken;

      if (controlConfig.paused && !runNowRequested) {
        await log('paused by coordinator control settings');
      } else {
        await runOnce(server, nodeId, effectiveIdleConfig, extractorMode, mockAllowed, runNowRequested);
      }
      lastRunNowToken = controlConfig.runNowToken;
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
  const extractorMode = readExtractorMode();
  const mockAllowed = allowMockExtractor();

  enforceExtractorPolicy(extractorMode, mockAllowed);

  if (extractorMode === 'local-llm') {
    await verifyLocalLlmAvailable(localLlmConfig);
    await log(`local llm ready endpoint=${localLlmConfig.endpoint} model=${localLlmConfig.model}`);
  }

  if (command === 'register') {
    await register(server, extractorMode);
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
    const nodeId = arg('--node-id') ?? (await register(server, extractorMode));
    await heartbeat(server, nodeId);
    await runOnce(server, nodeId, idleConfig, extractorMode, mockAllowed, arg('--force-now') === 'true');
    return;
  }

  if (command === 'loop') {
    const nodeId = arg('--node-id') ?? (await register(server, extractorMode));
    const intervalMs = Number(arg('--interval-ms', '5000'));
    await loop(server, nodeId, intervalMs, extractorMode, mockAllowed);
    return;
  }

  throw new Error(`unknown_command:${command}`);
}

main().catch(async (error) => {
  await log(`fatal ${(error as Error).message}`);
  process.exit(1);
});
