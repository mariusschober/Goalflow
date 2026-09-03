import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8'
);

describe('macOS beta artifact', () => {
  it('labels, verifies, fingerprints, and retains the ad-hoc candidate honestly', () => {
    expect(workflow).toContain('Build ad-hoc signed macOS beta candidate');
    expect(workflow).toContain('codesign --verify --deep --strict "$app"');
    expect(workflow).toContain('goalflow-macos-ad-hoc-beta.zip');
    expect(workflow).toContain('shasum -a 256 --check goalflow-macos-ad-hoc-beta.zip.sha256');
    expect(workflow).toContain('signing=ad-hoc');
    expect(workflow).toContain('notarization=not-requested');
    expect(workflow).toContain('name: goalflow-macos-ad-hoc-beta');
    expect(workflow).toContain('if-no-files-found: error');
  });
});
