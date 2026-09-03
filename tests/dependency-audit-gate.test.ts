import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  packageManager?: string;
  engines?: Record<string, string>;
  scripts?: Record<string, string>;
};
const auditScript = readFileSync(new URL('../scripts/audit-dependencies.mjs', import.meta.url), 'utf8');
const betaWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

describe('dependency advisory gate', () => {
  it('uses the exact package-manager version declared by the repository', () => {
    expect(packageJson.packageManager).toBe('npm@11.9.0');
    expect(packageJson.engines?.npm).toBe('11.9.x');
    expect(packageJson.scripts?.['audit:dependencies']).toBe('node scripts/audit-dependencies.mjs');
    expect(auditScript).toContain("const expectedNpmVersion = '11.9.0'");
    expect(auditScript).toContain("spawnSync(auditor, ['--version']");
    expect(auditScript).toContain("spawnSync(auditor, ['audit', '--audit-level=high']");
  });

  it('fails rather than falling back when installation, version verification, or audit fails', () => {
    expect(auditScript).toContain("'--ignore-scripts', '--no-audit', '--no-fund'");
    expect(auditScript).toContain('timeout: 120_000');
    expect(auditScript).toContain('timeout: 180_000');
    expect(auditScript).not.toContain("'--force'");
    expect(auditScript).not.toContain("'--audit-level=critical'");
  });

  it('is required by both beta verification paths and the authorized release', () => {
    expect(betaWorkflow.match(/npm run audit:dependencies/g)).toHaveLength(2);
    expect(releaseWorkflow).toContain('npm run audit:dependencies');
    expect(betaWorkflow).not.toContain('npm audit --audit-level=high');
  });
});
