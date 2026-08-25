import { spawn } from 'node:child_process';

const port = Number(process.env.VERIFY_PORT || 4173);
const child = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) },
  stdio: 'inherit'
});

const stop = () => {
  if (!child.killed) child.kill('SIGTERM');
};

try {
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) break;
    } catch (_) {
      // The server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!response?.ok) throw new Error('Production health endpoint did not become ready.');
  const body = await response.json();
  if (body?.status !== 'ok') throw new Error('Production health endpoint returned an invalid status.');
  console.log(JSON.stringify({ status: 'ok', health: body }));
} finally {
  stop();
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(resolve, 2_000).unref();
  });
}
