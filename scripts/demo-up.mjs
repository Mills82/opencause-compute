import { spawn } from 'node:child_process';

const server = process.env.COORDINATOR_URL ?? 'http://localhost:3000';
const intervalMs = process.env.WORKER_INTERVAL_MS ?? '5000';
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runNpm(args, label) {
  const child = spawn(npmBin, args, {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${label}] exited via signal ${signal}`);
      return;
    }
    if (code !== 0) {
      console.log(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

async function waitForCoordinator(url, timeoutMs = 120_000) {
  const started = Date.now();
  const endpoint = `${url}/api/projects`;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Coordinator did not become ready within ${Math.floor(timeoutMs / 1000)}s at ${endpoint}`);
}

async function seed(url) {
  const res = await fetch(`${url}/api/admin/seed-demo-data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' }
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Seed failed: ${JSON.stringify(json)}`);
  }
  console.log(`[seed] packetsCreated=${json.seeded?.packetsCreated ?? 'unknown'}`);
}

async function main() {
  console.log(`[demo:up] starting web coordinator at ${server}`);
  const web = runNpm(['run', 'dev:web'], 'web');

  try {
    await waitForCoordinator(server);
    console.log('[demo:up] coordinator ready');
    await seed(server);
    console.log('[demo:up] starting worker loop');

    const worker = runNpm(
      ['run', 'dev', '-w', '@opencause/worker', '--', 'loop', '--server', server, '--interval-ms', intervalMs],
      'worker'
    );

    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      console.log('\n[demo:up] shutting down');
      worker.kill('SIGTERM');
      web.kill('SIGTERM');
      setTimeout(() => process.exit(0), 500);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    worker.on('exit', () => {
      if (!shuttingDown) {
        web.kill('SIGTERM');
      }
    });

    web.on('exit', () => {
      if (!shuttingDown) {
        worker.kill('SIGTERM');
      }
    });
  } catch (error) {
    web.kill('SIGTERM');
    throw error;
  }
}

main().catch((error) => {
  console.error(`[demo:up] ${error.message}`);
  process.exit(1);
});
