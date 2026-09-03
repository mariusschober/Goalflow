import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// npm 10 falls back to the retiring quick-audit endpoint for this valid npm 11
// lock tree. Install the exact package-manager version declared in package.json
// into an isolated temporary prefix, verify it, and let every network, install,
// timeout, or advisory failure propagate. This is a fail-closed audit, not a
// retry.
const expectedNpmVersion = '11.9.0';
const baseDirectory = process.env.RUNNER_TEMP || process.env.TMPDIR || tmpdir();
const auditorRoot = mkdtempSync(join(baseDirectory, 'goalflow-npm-auditor-'));
const systemNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const auditor = process.platform === 'win32'
  ? join(auditorRoot, 'npm.cmd')
  : join(auditorRoot, 'bin', 'npm');

const requireSuccess = (result, label) => {
  if (result.error) {
    const reason = result.error.code === 'ETIMEDOUT' ? 'timed out' : 'could not start';
    console.error(`${label} ${reason}.`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} failed.`);
    process.exit(result.status ?? 1);
  }
};

const installation = spawnSync(systemNpm, [
  'install', '--global', '--prefix', auditorRoot, `npm@${expectedNpmVersion}`,
  '--ignore-scripts', '--no-audit', '--no-fund'
], { stdio: 'inherit', timeout: 120_000 });
requireSuccess(installation, 'Pinned dependency auditor installation');

const version = spawnSync(auditor, ['--version'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  timeout: 15_000
});
requireSuccess(version, 'Dependency auditor version check');
if (version.stdout.trim() !== expectedNpmVersion) {
  console.error('Dependency auditor version mismatch.');
  process.exit(1);
}

const audit = spawnSync(auditor, ['audit', '--audit-level=high'], {
  stdio: 'inherit',
  timeout: 180_000
});
requireSuccess(audit, 'Dependency audit');
