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
  const [cpuPercent, userIdleSeconds, battery] = await Promise.all([sampleCpuPercent(), getUserIdleSeconds(), batteryStatus()]);
  const controls = settings.resourceControls;
  const userIdleOk = controls.schedule === 'always' || controls.idleMode === 'cpu-only' || (userIdleSeconds !== null && userIdleSeconds >= controls.minIdleSeconds);
  const cpuOk = cpuPercent <= controls.maxCpuPercent;
  const batteryOk = controls.runOnBattery || !battery.onBattery;
  const eligible = controls.schedule !== 'manual' && userIdleOk && cpuOk && batteryOk;
  const reason = controls.schedule === 'manual'
    ? 'manual_schedule'
    : !batteryOk
      ? 'on_battery'
    : !cpuOk
      ? 'high_cpu'
      : !userIdleOk
        ? userIdleSeconds === null ? 'user_idle_unavailable' : 'user_not_idle'
        : 'ok';
  const gpu = await gpuStatus();
  return {
    schedule: controls.schedule,
    idleMode: controls.idleMode,
    userIdleSeconds,
    minIdleSeconds: controls.minIdleSeconds,
    cpuPercent,
    maxCpuPercent: controls.maxCpuPercent,
    battery,
    eligible,
    reason,
    gpu
  };
}

export async function batteryStatus(): Promise<{ available: boolean; onBattery: boolean }> {
  if (process.env.FORCE_ON_BATTERY === 'true') return { available: true, onBattery: true };
  if (process.env.FORCE_ON_BATTERY === 'false') return { available: true, onBattery: false };
  if (process.platform === 'win32') {
    const output = await runCommand('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery | Select-Object -First 1 -ExpandProperty BatteryStatus)']);
    const status = Number(output);
    if (Number.isFinite(status)) return { available: true, onBattery: status === 1 };
  }
  if (process.platform === 'darwin') {
    const output = await runCommand('pmset', ['-g', 'batt']);
    if (output) return { available: true, onBattery: /Battery Power/i.test(output) };
  }
  if (process.platform === 'linux') {
    const output = await runCommand('sh', ['-lc', "for f in /sys/class/power_supply/AC*/online /sys/class/power_supply/ADP*/online; do [ -f \"$f\" ] && cat \"$f\" && exit 0; done; true"]);
    if (output === '0') return { available: true, onBattery: true };
    if (output === '1') return { available: true, onBattery: false };
  }
  return { available: false, onBattery: false };
}

export async function gpuStatus(): Promise<{ available: boolean; name?: string; utilizationPercent?: number; memoryUsedMiB?: number; memoryTotalMiB?: number; temperatureC?: number; source?: string; message?: string }> {
  if (process.platform !== 'win32') return { available: false, message: 'GPU telemetry currently supported on Windows/NVIDIA only.' };
  const output = await runCommand('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits']);
  if (!output) return { available: false, source: 'nvidia-smi', message: 'NVIDIA GPU telemetry unavailable.' };
  const [name, util, used, total, temp] = output.split('\n')[0].split(',').map((part) => part.trim());
  return {
    available: true,
    name,
    utilizationPercent: Number(util),
    memoryUsedMiB: Number(used),
    memoryTotalMiB: Number(total),
    temperatureC: Number(temp),
    source: 'nvidia-smi'
  };
}

export function recommendedModelConfig(settings: DesktopSettings) {
  const totalMemoryGb = os.totalmem() / 1024 / 1024 / 1024;
  const cpuCores = os.cpus().length;
  const model = settings.modelRuntime.model;
  const qualityMode = settings.modelRuntime.qualityMode;
  const base = qualityMode === 'ultra'
    ? { numCtx: 32768, numPredict: 1800, tier: 'ultra' as const }
    : qualityMode === 'high'
      ? { numCtx: 16384, numPredict: 1800, tier: 'high' as const }
      : qualityMode === 'budget'
        ? { numCtx: 8192, numPredict: 1800, tier: 'balanced' as const }
        : { numCtx: 12288, numPredict: 1800, tier: 'high' as const };
  const constrained = totalMemoryGb < 12 || cpuCores < 6;
  const highEnd = totalMemoryGb >= 48 && cpuCores >= 12;
  const recommended = constrained ? { numCtx: 8192, numPredict: 1800, tier: 'balanced' as const } : highEnd ? { numCtx: 32768, numPredict: 1800, tier: 'ultra' as const } : base;
  return {
    model,
    qualityMode,
    totalMemoryGb: Number(totalMemoryGb.toFixed(1)),
    cpuCores,
    recommendedNumCtx: recommended.numCtx,
    recommendedNumPredict: recommended.numPredict,
    recommendedTier: recommended.tier,
    note: constrained ? '8k context is the minimum recommended for biomedical papers on this machine.' : highEnd ? '32k ultra context should be reasonable for this higher-end machine.' : '16k high-quality context looks reasonable for this machine.'
  };
}
