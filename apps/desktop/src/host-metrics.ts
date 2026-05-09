import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { DesktopSettings } from './settings';

const execFileAsync = promisify(execFile);

type CpuTimes = { idle: number; total: number };

function readCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

export async function sampleCpuPercent(sampleMs = 750): Promise<number> {
  const start = readCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = readCpuTimes();
  const deltaTotal = Math.max(1, end.total - start.total);
  const deltaIdle = Math.max(0, end.idle - start.idle);
  return Number((100 * (1 - deltaIdle / deltaTotal)).toFixed(2));
}

async function runCommand(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 2500, windowsHide: true });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getUserIdleSeconds(): Promise<number | null> {
  if (process.platform === 'win32') {
    const ps = [
      '$code = @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class IdleTime {',
      '  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }',
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
    const seconds = Number(output);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (process.platform === 'darwin') {
    const output = await runCommand('sh', ['-lc', "ioreg -c IOHIDSystem | awk '/HIDIdleTime/ { print int($NF/1000000000); exit }'"]);
    const seconds = Number(output);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (process.platform === 'linux') {
    const output = await runCommand('sh', ['-lc', 'command -v xprintidle >/dev/null 2>&1 && xprintidle || true']);
    const millis = Number(output);
    return Number.isFinite(millis) ? Math.floor(millis / 1000) : null;
  }
  return null;
}

export async function resourceStatus(settings: DesktopSettings) {
  const [cpuPercent, userIdleSeconds] = await Promise.all([sampleCpuPercent(), getUserIdleSeconds()]);
  const controls = settings.resourceControls;
  const userIdleOk = controls.schedule === 'always' || controls.idleMode === 'cpu-only' || (userIdleSeconds !== null && userIdleSeconds >= controls.minIdleSeconds);
  const cpuOk = cpuPercent <= controls.maxCpuPercent;
  const eligible = controls.schedule !== 'manual' && userIdleOk && cpuOk;
  const reason = controls.schedule === 'manual'
    ? 'manual_schedule'
    : !cpuOk
      ? 'high_cpu'
      : !userIdleOk
        ? userIdleSeconds === null ? 'user_idle_unavailable' : 'user_not_idle'
        : 'ok';
  return {
    schedule: controls.schedule,
    idleMode: controls.idleMode,
    userIdleSeconds,
    minIdleSeconds: controls.minIdleSeconds,
    cpuPercent,
    maxCpuPercent: controls.maxCpuPercent,
    eligible,
    reason
  };
}

export function recommendedModelConfig(settings: DesktopSettings) {
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024;
  const cpuCores = os.cpus().length;
  const model = settings.modelRuntime.model;
  const qualityMode = settings.modelRuntime.qualityMode;
  const base = qualityMode === 'balanced'
    ? { numCtx: 4096, numPredict: 900, tier: 'balanced' as const }
    : { numCtx: 8192, numPredict: 1200, tier: 'high' as const };
  const constrained = totalMemoryGb < 12 || cpuCores < 6;
  const recommended = constrained ? { numCtx: 4096, numPredict: 900, tier: 'balanced' as const } : base;
  return {
    model,
    qualityMode,
    totalMemoryGb: Number(totalMemoryGb.toFixed(1)),
    cpuCores,
    recommendedNumCtx: recommended.numCtx,
    recommendedNumPredict: recommended.numPredict,
    recommendedTier: recommended.tier,
    note: constrained ? 'Balanced defaults recommended for this machine size.' : 'High-quality defaults look reasonable for this machine.'
  };
}
