import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../.github/workflows/release.yml', import.meta.url),
  'utf8'
);

describe('manual release workflow', () => {
  it('requires a successful beta gate from an exact main push run', () => {
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('set -euo pipefail');
    expect(workflow).toContain(
      '/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&head_sha=$GITHUB_SHA'
    );
    expect(workflow).toContain('.head_branch == "main"');
    expect(workflow).toContain('.event == "push"');
    expect(workflow).toContain('/actions/runs/$run_id/jobs?filter=latest');
    expect(workflow).toContain('.name == "beta-gate"');
    expect(workflow).not.toContain('/commits/$GITHUB_SHA/check-runs');
  });
});
