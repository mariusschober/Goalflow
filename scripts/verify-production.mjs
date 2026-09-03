import { spawn } from 'node:child_process';

const port = Number(process.env.VERIFY_PORT || 4173);
const childEnvironment = { ...process.env };
for (const name of [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OWNER_USER_ID',
  'BACKUP_MASTER_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_WEBHOOK_SECRET',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY'
]) delete childEnvironment[name];

const child = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: {
    ...childEnvironment,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    APP_ORIGIN: 'https://goalflow.invalid',
    ENABLE_LOCAL_DEMO: 'false',
    TELEGRAM_ENABLED: 'false',
    AI_ENABLED: 'false',
    VOICE_ENABLED: 'false',
    TURNSTILE_ENABLED: 'false',
    BACKUPS_ENABLED: 'false'
  },
  stdio: 'inherit'
});

const stop = () => {
  if (!child.killed) child.kill('SIGTERM');
};

try {
  let liveResponse;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      liveResponse = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`);
      if (liveResponse.ok) break;
    } catch (_) {
      // The server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!liveResponse?.ok) throw new Error('Production liveness endpoint did not start.');
  const liveBody = await liveResponse.json();
  if (liveBody?.status !== 'alive' || Object.keys(liveBody).length !== 1) {
    throw new Error('Production liveness disclosed unexpected state.');
  }

  const readyResponse = await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`);
  const readyBody = await readyResponse.json();
  if (readyResponse.status !== 503 || readyBody?.status !== 'not_ready') {
    throw new Error('Production became ready without its required cloud dependencies.');
  }

  const legacyResponse = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
  if (legacyResponse.status !== 503) {
    throw new Error('Legacy health alias reported false success.');
  }
  console.log(JSON.stringify({ status: 'ok', contract: 'production-fails-closed' }));
} finally {
  stop();
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(resolve, 2_000).unref();
  });
}
