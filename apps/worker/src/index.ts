import { appendFile, chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  runMockExtractorV1,
  verifyPayloadEd25519,
  verifyPayloadHmac,
  type ResultPayload,
  type ResultProvenance,
  type WorkPacketPayload,
  type WorkerControlConfig
} from '@opencause/shared';
import { assertApprovedExtractor, assertLocalhostEndpoint, assertPathInside } from './extractor-manifest.js';
import { checkBatteryPolicy, checkHostIdle, type IdleConfig, type IdleMode } from './idle.js';
import { LOCAL_LLM_PROMPT_VERSION, LOCAL_LLM_V2_PROMPT_VERSION, generationQualityTier, localLlmPromptHash, localLlmV2PromptHash, readLocalLlmConfig, runLocalLlmExtractor, runLocalLlmV2Extractor, verifyLocalLlmAvailable } from './local-llm.js';
import { redactSensitive } from './redaction.js';

type JsonValue = Record<string, unknown>;
type ExtractorMode = 'local-llm' | 'mock';
type ExtractorVersion = 'Local LLM v1' | 'Local LLM v2' | 'Mock Extractor v1';

const DEFAULT_SERVER = process.env.COORDINATOR_URL ?? 'http://localhost:3000';
const SIGNING_SECRET = process.env.SIGNING_SECRET ?? 'opencause-dev-signing-secret-v1';
const PACKET_SIGNING_PUBLIC_KEY = process.env.PACKET_SIGNING_PUBLIC_KEY;
const PACKET_SIGNING_KEY_ID = process.env.PACKET_SIGNING_KEY_ID;
const APP_DIR = path.resolve(process.env.OPENCAUSE_APP_DIR ?? path.join(os.homedir(), '.opencause-compute'));
const LOG_PATH = path.join(APP_DIR, 'worker.log');
const NODE_PATH = path.join(APP_DIR, 'node.json');
const WORKER_VERSION = process.env.WORKER_VERSION ?? '0.1.0';
const PACKET_SCHEMA_VERSION = 'work-packet-v1';
const RESULT_VALIDATION_VERSION = 'format-validation-v1';
const localLlmConfig = readLocalLlmConfig();

function assertSafeAppDir(): void {
  const home = path.resolve(os.homedir());
  if (APP_DIR === home || APP_DIR === path.parse(APP_DIR).root) {
    throw new Error('unsafe_app_dir');
  }
  assertPathInside(APP_DIR, LOG_PATH);
  assertPathInside(APP_DIR, NODE_PATH);
}

async function log(message: string): Promise<void> {
  await mkdir(APP_DIR, { recursive: true });
  const line = `[${new Date().toISOString()}] ${redactSensitive(message)}\n`;
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
  assertApprovedExtractor(mode, { allowMock: mockAllowed });
  if (mode === 'local-llm') assertLocalhostEndpoint(localLlmConfig.endpoint);
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

function runOnBatteryAllowed(): boolean {
  return arg('--run-on-battery', process.env.RUN_ON_BATTERY ?? 'false') === 'true';
}

function toIdleConfigFromControl(config: WorkerControlConfig): IdleConfig {
  return {
    mode: config.idleMode,
    minIdleSeconds: config.minIdleSeconds,
    maxCpuPercent: config.maxCpuPercent,
    sampleMs: Number(arg('--cpu-sample-ms', process.env.CPU_SAMPLE_MS ?? '800'))
  };
}

async function post<T>(server: string, route: string, body: JsonValue, nodeToken?: string): Promise<T> {
  const response = await fetch(`${server}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(nodeToken ? { 'x-node-token': nodeToken } : {}) },
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

type NodeCredentials = { nodeId: string; nodeToken: string; profileSetupToken?: string; profileSetupUrl?: string };

async function saveNodeCredentials(credentials: NodeCredentials): Promise<void> {
  await mkdir(APP_DIR, { recursive: true });
  await writeFile(NODE_PATH, JSON.stringify(credentials, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { await chmod(NODE_PATH, 0o600); } catch {}
}

async function loadNodeCredentials(): Promise<NodeCredentials | null> {
  try {
    const parsed = JSON.parse(await readFile(NODE_PATH, 'utf8')) as NodeCredentials;
    if (parsed.nodeId && parsed.nodeToken) return parsed;
  } catch {}
  return null;
}

async function register(server: string, extractorMode: ExtractorMode): Promise<NodeCredentials> {
  const nodeName = arg('--node-name', `${os.hostname()}-worker`) as string;
  const platform = `${process.platform}-${process.arch}`;
  const version = WORKER_VERSION;
  const capabilities = extractorMode === 'local-llm' ? ['local-llm-v1', 'local-llm-v2'] : ['mock-extractor-v1'];
  const enrollmentCode = (arg('--enrollment-code') as string | undefined) || process.env.NODE_ENROLLMENT_CODE;

  const response = await post<{ node: { id: string }; nodeToken: string; profileSetupToken?: string }>(server, '/api/nodes/register', {
    nodeName,
    platform,
    version,
    capabilities,
    ...(enrollmentCode ? { enrollmentCode } : {})
  });

  const profileSetupUrl = response.profileSetupToken ? `${server.replace(/\/$/, '')}/volunteer/profile?token=${encodeURIComponent(response.profileSetupToken)}` : undefined;
  const credentials = { nodeId: response.node.id, nodeToken: response.nodeToken, profileSetupToken: response.profileSetupToken, profileSetupUrl };
  await saveNodeCredentials(credentials);
  await log(`registered node ${response.node.id}`);
  if (profileSetupUrl) await log('profile setup link issued');
  return credentials;
}

async function heartbeat(server: string, credentials: NodeCredentials, extractorMode: ExtractorMode): Promise<void> {
  const nodeId = credentials.nodeId;
  await post(server, '/api/nodes/heartbeat', { nodeId, capabilities: extractorMode === 'local-llm' ? ['local-llm-v2', 'local-llm-v1'] : ['mock-extractor-v1'] }, credentials.nodeToken);
  await log(`heartbeat ${nodeId}`);
}

async function claim(server: string, credentials: NodeCredentials): Promise<
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
  >(server, '/api/work/claim', { nodeId: credentials.nodeId }, credentials.nodeToken);

  if ('claim' in response) {
    await log('no work available');
    return null;
  }

  await log(`claimed packet ${response.packet.id}`);
  return response;
}

async function submit(
  server: string,
  credentials: NodeCredentials,
  claimId: string,
  packetId: string,
  extractorVersion: ExtractorVersion,
  result: ResultPayload,
  provenance: ResultProvenance
): Promise<void> {
  const response = await post<{ result: { id: string; validated: boolean } }>(server, '/api/work/submit', {
    nodeId: credentials.nodeId,
    claimId,
    workPacketId: packetId,
    extractorVersion,
    result,
    provenance
  }, credentials.nodeToken);

  await log(`submitted result ${response.result.id} validated=${response.result.validated}`);
}

async function closeClaim(
  server: string,
  credentials: NodeCredentials,
  claimId: string,
  packetId: string,
  reason: string,
  disposition: 'failed' | 'released' = 'failed'
): Promise<void> {
  const route = disposition === 'released' ? '/api/work/release' : '/api/work/fail';
  await post(server, route, {
    nodeId: credentials.nodeId,
    claimId,
    workPacketId: packetId,
    reason: reason.slice(0, 500)
  }, credentials.nodeToken);
  await log(`reported ${disposition} claim packet ${packetId} reason=${reason}`);
}

function isClaimAlreadyClosedError(error: unknown): boolean {
  return error instanceof Error && /claim_completed|claim_failed|claim_expired/.test(error.message);
}

function endpointType(endpoint: string): string {
  if (endpoint.startsWith('http://127.0.0.1') || endpoint.startsWith('http://localhost')) return 'localhost';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return 'remote-http';
  return 'other';
}

function buildProvenance(
  extractorVersion: ExtractorVersion,
  extractorMode: ExtractorMode,
  capabilities: string[]
): ResultProvenance {
  return {
    workerVersion: WORKER_VERSION,
    extractorVersion,
    modelName: extractorMode === 'local-llm' ? localLlmConfig.model : 'mock',
    modelProvider: extractorMode === 'local-llm' ? 'ollama' : 'mock',
    promptVersion: extractorVersion === 'Local LLM v2' ? LOCAL_LLM_V2_PROMPT_VERSION : extractorMode === 'local-llm' ? LOCAL_LLM_PROMPT_VERSION : 'mock-extractor-v1-prompt',
    promptHash: extractorVersion === 'Local LLM v2' ? localLlmV2PromptHash() : extractorMode === 'local-llm' ? localLlmPromptHash() : 'mock-extractor-v1',
    packetSchemaVersion: PACKET_SCHEMA_VERSION,
    extractionTimestamp: new Date().toISOString(),
    localLlmEndpointType: extractorMode === 'local-llm' ? endpointType(localLlmConfig.endpoint) : undefined,
    generationOptions: extractorMode === 'local-llm' ? localLlmConfig.options : undefined,
    generationQualityTier: extractorMode === 'local-llm' ? generationQualityTier(localLlmConfig) : 'mock',
    workerPlatform: `${process.platform}-${process.arch}`,
    workerCapabilities: capabilities,
    resultValidationVersion: extractorVersion === 'Local LLM v2' ? 'claims-v2' : RESULT_VALIDATION_VERSION
  };
}

async function extractFromPacket(
  packet: WorkPacketPayload,
  extractorMode: ExtractorMode,
  mockAllowed: boolean,
  signal?: AbortSignal
): Promise<{ extractorVersion: ExtractorVersion; result: ResultPayload; provenance: ResultProvenance }> {
  const capabilities = extractorMode === 'local-llm' ? ['local-llm-v1', 'local-llm-v2'] : ['mock-extractor-v1'];
  if (packet.extractor === 'mock-extractor-v1') {
    if (!mockAllowed || extractorMode !== 'mock') {
      throw new Error('mock_extractor_packet_rejected');
    }
    return {
      extractorVersion: 'Mock Extractor v1',
      result: runMockExtractorV1(packet.sourceText),
      provenance: buildProvenance('Mock Extractor v1', extractorMode, capabilities)
    };
  }

  if (extractorMode !== 'local-llm') {
    throw new Error('packet_requires_local_llm');
  }

  if (packet.extractor === 'local-llm-v2') {
    const result = await runLocalLlmV2Extractor(packet.sourceText, localLlmConfig, signal);
    return {
      extractorVersion: 'Local LLM v2',
      result,
      provenance: buildProvenance('Local LLM v2', extractorMode, capabilities)
    };
  }

  const result = await runLocalLlmExtractor(packet.sourceText, localLlmConfig, signal);
  return {
    extractorVersion: 'Local LLM v1',
    result,
    provenance: buildProvenance('Local LLM v1', extractorMode, capabilities)
  };
}

async function runOnce(
  server: string,
  credentials: NodeCredentials,
  idleConfig: IdleConfig,
  extractorMode: ExtractorMode,
  mockAllowed: boolean,
  bypassIdleGate = false,
  failureAttempts: Map<string, number> = new Map()
): Promise<void> {
  const batteryBlock = await checkBatteryPolicy(runOnBatteryAllowed());
  if (batteryBlock) {
    await log('battery policy blocked run reason=on_battery');
    return;
  }
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

  const claimed = await claim(server, credentials);
  if (!claimed) {
    return;
  }

  let signatureEnvelope: { algorithm?: string; keyId?: string } = {};
  try { signatureEnvelope = JSON.parse(claimed.signature) as { algorithm?: string; keyId?: string }; } catch {}
  if (signatureEnvelope.algorithm === 'ed25519' && !PACKET_SIGNING_PUBLIC_KEY) {
    await log(`packet signing public key missing for keyId=${signatureEnvelope.keyId ?? 'unknown'}`);
    await closeClaim(server, credentials, claimed.claimId, claimed.packet.id, 'packet_signing_public_key_missing', 'failed');
    return;
  }
  const isValidSignature = PACKET_SIGNING_PUBLIC_KEY
    ? verifyPayloadEd25519(claimed.packet, claimed.signature, PACKET_SIGNING_PUBLIC_KEY, PACKET_SIGNING_KEY_ID)
    : verifyPayloadHmac(claimed.packet, claimed.signature, SIGNING_SECRET);
  if (!isValidSignature) {
    await log(`signature verification failed for packet ${claimed.packet.id} algorithm=${signatureEnvelope.algorithm ?? 'unknown'} keyId=${signatureEnvelope.keyId ?? 'unknown'} publicKeyLoaded=${Boolean(PACKET_SIGNING_PUBLIC_KEY)}`);
    await closeClaim(server, credentials, claimed.claimId, claimed.packet.id, 'invalid_packet_signature', 'failed');
    return;
  }

  await log(`signature verified for packet ${claimed.packet.id} algorithm=${signatureEnvelope.algorithm ?? 'unknown'} keyId=${signatureEnvelope.keyId ?? 'unknown'}`);
  const postClaimBatteryBlock = await checkBatteryPolicy(runOnBatteryAllowed());
  if (postClaimBatteryBlock) {
    await log('battery policy changed after claim reason=on_battery; releasing claim');
    await closeClaim(server, credentials, claimed.claimId, claimed.packet.id, 'on_battery', 'released');
    return;
  }
  if (!bypassIdleGate) {
    const beforeExtractIdleDecision = await checkHostIdle(idleConfig);
    if (!beforeExtractIdleDecision.eligible) {
      const userIdle = beforeExtractIdleDecision.metrics.userIdleSeconds === null ? 'n/a' : `${beforeExtractIdleDecision.metrics.userIdleSeconds}s`;
      const reason = `idle gate blocked extraction reason=${beforeExtractIdleDecision.reason} cpu=${beforeExtractIdleDecision.metrics.cpuPercent}% userIdle=${userIdle}`;
      await log(reason);
      await closeClaim(server, credentials, claimed.claimId, claimed.packet.id, beforeExtractIdleDecision.reason, 'released');
      return;
    }
  }
  const controller = new AbortController();
  const watchdog = setInterval(async () => {
    try {
      const control = await getControlConfig(server);
      if (control.paused) controller.abort(new Error('cancelled:paused'));
      const battery = await checkBatteryPolicy(runOnBatteryAllowed());
      if (battery) controller.abort(new Error('cancelled:on_battery'));
      if (!bypassIdleGate) {
        const idle = await checkHostIdle(idleConfig);
        if (!idle.eligible) controller.abort(new Error(`cancelled:${idle.reason}`));
      }
    } catch {}
  }, Math.max(1000, Number(process.env.CANCELLATION_POLL_MS ?? '5000')));
  try {
    const extraction = await extractFromPacket(claimed.packet, extractorMode, mockAllowed, controller.signal);
    await submit(server, credentials, claimed.claimId, claimed.packet.id, extraction.extractorVersion, extraction.result, extraction.provenance);
    failureAttempts.delete(claimed.packet.id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason.startsWith('cancelled:')) {
      await log(`generation cancelled for packet ${claimed.packet.id} reason=${reason}`);
      await closeClaim(server, credentials, claimed.claimId, claimed.packet.id, reason.replace(/^cancelled:/, ''), 'released');
      return;
    }
    const attempts = (failureAttempts.get(claimed.packet.id) ?? 0) + 1;
    failureAttempts.set(claimed.packet.id, attempts);
    if (attempts >= 2) {
      try {
        await closeClaim(server, credentials, claimed.claimId, claimed.packet.id, reason, 'failed');
      } catch (failError) {
        if (isClaimAlreadyClosedError(failError)) {
          await log(`claim already closed for packet ${claimed.packet.id}; clearing local retry state`);
        } else {
          throw failError;
        }
      }
      failureAttempts.delete(claimed.packet.id);
    }
    throw error;
  } finally {
    clearInterval(watchdog);
  }
}

async function loop(
  server: string,
  credentials: NodeCredentials,
  intervalMs: number,
  localIdleConfig: IdleConfig,
  extractorMode: ExtractorMode,
  mockAllowed: boolean
): Promise<void> {
  await log(`loop started intervalMs=${intervalMs} idleMode=${localIdleConfig.mode} minIdleSeconds=${localIdleConfig.minIdleSeconds} maxCpuPercent=${localIdleConfig.maxCpuPercent}`);
  let lastRunNowToken: number | null = null;
  const failureAttempts = new Map<string, number>();

  while (true) {
    try {
      await heartbeat(server, credentials, extractorMode);
      const controlConfig = await getControlConfig(server);
      const effectiveIdleConfig = localIdleConfig;
      const runNowRequested = lastRunNowToken !== null && controlConfig.runNowToken !== lastRunNowToken;

      if (controlConfig.paused && !runNowRequested) {
        await log('paused by coordinator control settings');
      } else {
      try {
        await runOnce(server, credentials, effectiveIdleConfig, extractorMode, mockAllowed, runNowRequested, failureAttempts);
      } catch (error) {
        await log(`run failed ${error instanceof Error ? error.message : String(error)}`);
      }
      }
      lastRunNowToken = controlConfig.runNowToken;
    } catch (error) {
      await log(`loop error ${(error as Error).message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function status(): Promise<void> {
  const credentials = await loadNodeCredentials();
  const logInfo = await stat(LOG_PATH).catch(() => null);
  const state = {
    appDir: APP_DIR,
    logPath: LOG_PATH,
    credentialsPath: NODE_PATH,
    registered: Boolean(credentials),
    nodeId: credentials?.nodeId ?? null,
    workerVersion: WORKER_VERSION,
    platform: `${process.platform}-${process.arch}`,
    logBytes: logInfo?.size ?? 0
  };
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

async function uninstallLocalState(): Promise<void> {
  assertSafeAppDir();
  await rm(APP_DIR, { recursive: true, force: true });
  process.stdout.write(`Removed OpenCause Compute worker local state at ${APP_DIR}\n`);
}

async function main() {
  assertSafeAppDir();
  const command = process.argv[2] ?? 'run-once';
  const server = arg('--server', DEFAULT_SERVER) as string;
  const idleConfig = readIdleConfig();
  const extractorMode = readExtractorMode();
  const mockAllowed = allowMockExtractor();

  enforceExtractorPolicy(extractorMode, mockAllowed);

  if (command === 'status') {
    await status();
    return;
  }

  if (command === 'uninstall-local-state') {
    await uninstallLocalState();
    return;
  }

  if (extractorMode === 'local-llm') {
    await verifyLocalLlmAvailable(localLlmConfig);
    await log(`local llm ready endpointType=${endpointType(localLlmConfig.endpoint)} model=${localLlmConfig.model}`);
  }

  if (command === 'register') {
    await register(server, extractorMode);
    return;
  }

  if (command === 'heartbeat') {
    const nodeToken = required(arg('--node-token', process.env.NODE_TOKEN), '--node-token');
    const nodeId = required(arg('--node-id'), '--node-id');
    await heartbeat(server, { nodeId, nodeToken }, extractorMode);
    return;
  }

  if (command === 'claim') {
    const nodeToken = required(arg('--node-token', process.env.NODE_TOKEN), '--node-token');
    const nodeId = required(arg('--node-id'), '--node-id');
    await claim(server, { nodeId, nodeToken });
    return;
  }

  if (command === 'run-once') {
    const credentials = (await loadNodeCredentials()) ?? (arg('--node-id') && arg('--node-token', process.env.NODE_TOKEN) ? { nodeId: arg('--node-id') as string, nodeToken: arg('--node-token', process.env.NODE_TOKEN) as string } : await register(server, extractorMode));
    await heartbeat(server, credentials, extractorMode);
    await runOnce(server, credentials, idleConfig, extractorMode, mockAllowed, arg('--force-now') === 'true');
    return;
  }

  if (command === 'loop') {
    const credentials = (await loadNodeCredentials()) ?? (arg('--node-id') && arg('--node-token', process.env.NODE_TOKEN) ? { nodeId: arg('--node-id') as string, nodeToken: arg('--node-token', process.env.NODE_TOKEN) as string } : await register(server, extractorMode));
    const intervalMs = Number(arg('--interval-ms', '5000'));
    await loop(server, credentials, intervalMs, idleConfig, extractorMode, mockAllowed);
    return;
  }

  throw new Error(`unknown_command:${command}`);
}

main().catch(async (error) => {
  await log(`fatal ${(error as Error).message}`);
  process.exit(1);
});
