import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type IdleMode = 'user-and-cpu' | 'cpu-only';

export type IdleConfig = {
  mode: IdleMode;
  minIdleSeconds: number;
  maxCpuPercent: number;
  sampleMs: number;
};

export type IdleMetrics = {
  cpuPercent: number;
  userIdleSeconds: number | null;
};

export type IdleDecision = {
  eligible: boolean;
  reason: 'ok' | 'high_cpu' | 'user_not_idle' | 'user_idle_unavailable' | 'on_battery';
  metrics: IdleMetrics;
};

export type BatteryStatus = { available: boolean; onBattery: boolean };

type CpuTimes = { idle: number; total: number };

function readCpuTimes(): CpuTimes {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }

  return { idle, total };
}

export function decideIdleEligibility(metrics: IdleMetrics, config: IdleConfig): IdleDecision {
  if (config.mode === 'user-and-cpu') {
    if (metrics.userIdleSeconds === null) {
      return { eligible: false, reason: 'user_idle_unavailable', metrics };
    }

    if (metrics.userIdleSeconds < config.minIdleSeconds) {
      return { eligible: false, reason: 'user_not_idle', metrics };
    }
  }

  if (metrics.cpuPercent > config.maxCpuPercent) {
    return { eligible: false, reason: 'high_cpu', metrics };
  }

  return { eligible: true, reason: 'ok', metrics };
}

export function decideContinueEligibility(metrics: IdleMetrics, config: IdleConfig): IdleDecision {
  if (config.mode === 'user-and-cpu') {
    if (metrics.userIdleSeconds === null) {
      return { eligible: false, reason: 'user_idle_unavailable', metrics };
    }

    if (metrics.userIdleSeconds < config.minIdleSeconds) {
      return { eligible: false, reason: 'user_not_idle', metrics };
    }
  }

  return { eligible: true, reason: 'ok', metrics };
}

export async function sampleCpuPercent(sampleMs: number): Promise<number> {
  const start = readCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = readCpuTimes();

  const deltaTotal = Math.max(1, end.total - start.total);
  const deltaIdle = Math.max(0, end.idle - start.idle);
  const usage = 100 * (1 - deltaIdle / deltaTotal);
  return Number(usage.toFixed(2));
}

async function runCommand(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 2500, windowsHide: true });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function getUserIdleSecondsDarwin(): Promise<number | null> {
  const output = await runCommand('sh', ['-lc', "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ { print int($NF/1000000000); exit }'"]);
  if (!output) {
    return null;
  }
  const seconds = Number(output);
  return Number.isFinite(seconds) ? seconds : null;
}

async function getUserIdleSecondsLinux(): Promise<number | null> {
  const output = await runCommand('sh', ['-lc', 'command -v xprintidle >/dev/null 2>&1 && xprintidle || true']);
  if (!output) {
    return null;
  }

  const millis = Number(output);
  if (!Number.isFinite(millis)) {
    return null;
  }
  return Math.floor(millis / 1000);
}

async function getUserIdleSecondsWindows(): Promise<number | null> {
  const ps = [
    '$code = @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class IdleTime {',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }',
    '  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO lii);',
    '  public static uint GetIdleSeconds() {',
    '    LASTINPUTINFO lii = new LASTINPUTINFO();',
    '    lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));',
    '    GetLastInputInfo(ref lii);',
    '    return ((uint)Environment.TickCount - lii.dwTime) / 1000;',
    '  }',
    '}',
    '"@;',
    'Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null;',
    '[IdleTime]::GetIdleSeconds()'
  ].join('\n');

  const output = await runCommand('powershell', ['-NoProfile', '-Command', ps]);
  if (!output) {
    return null;
  }
  const seconds = Number(output);
  return Number.isFinite(seconds) ? seconds : null;
}

export async function getUserIdleSeconds(): Promise<number | null> {
  if (process.platform === 'darwin') {
    return getUserIdleSecondsDarwin();
  }
  if (process.platform === 'linux') {
    return getUserIdleSecondsLinux();
  }
  if (process.platform === 'win32') {
    return getUserIdleSecondsWindows();
  }
  return null;
}

export async function checkHostIdle(config: IdleConfig): Promise<IdleDecision> {
  const [cpuPercent, userIdleSeconds] = await Promise.all([sampleCpuPercent(config.sampleMs), getUserIdleSeconds()]);
  return decideIdleEligibility({ cpuPercent, userIdleSeconds }, config);
}

export async function checkHostStillIdle(config: IdleConfig): Promise<IdleDecision> {
  const [cpuPercent, userIdleSeconds] = await Promise.all([sampleCpuPercent(config.sampleMs), getUserIdleSeconds()]);
  return decideContinueEligibility({ cpuPercent, userIdleSeconds }, config);
}

export async function getBatteryStatus(): Promise<BatteryStatus> {
  if (process.env.FORCE_ON_BATTERY === 'true') return { available: true, onBattery: true };
  if (process.env.FORCE_ON_BATTERY === 'false') return { available: true, onBattery: false };
  if (process.platform === 'linux') {
    const output = await runCommand('sh', ['-lc', "for f in /sys/class/power_supply/AC*/online /sys/class/power_supply/ADP*/online; do [ -f \"$f\" ] && cat \"$f\" && exit 0; done; true"]);
    if (output === '0') return { available: true, onBattery: true };
    if (output === '1') return { available: true, onBattery: false };
  }
  if (process.platform === 'darwin') {
    const output = await runCommand('pmset', ['-g', 'batt']);
    if (output) return { available: true, onBattery: /Battery Power/i.test(output) };
  }
  if (process.platform === 'win32') {
    const output = await runCommand('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery | Select-Object -First 1 -ExpandProperty BatteryStatus)']);
    const status = Number(output);
    if (Number.isFinite(status)) return { available: true, onBattery: status === 1 };
  }
  return { available: false, onBattery: false };
}

export async function checkBatteryPolicy(runOnBattery: boolean): Promise<IdleDecision | null> {
  const battery = await getBatteryStatus();
  if (!runOnBattery && battery.available && battery.onBattery) {
    return { eligible: false, reason: 'on_battery', metrics: { cpuPercent: 0, userIdleSeconds: null } };
  }
  return null;
}
