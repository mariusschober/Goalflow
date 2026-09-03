import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../.github/workflows/android-internal-beta.yml', import.meta.url),
  'utf8'
);

describe('Android internal beta workflow', () => {
  it('accepts only an exact green integration candidate', () => {
    expect(workflow).toContain('refs/heads/integration/beta');
    expect(workflow).not.toContain('refs/heads/main');
    expect(workflow).toContain(
      '/actions/workflows/ci.yml/runs?branch=integration%2Fbeta&event=push&status=success&head_sha=$GITHUB_SHA'
    );
    expect(workflow).toContain('.head_branch == "integration/beta"');
    expect(workflow).toContain('.event == "push"');
    expect(workflow).toContain('.name == "beta-gate"');
    expect(workflow).toContain("Internal beta confirmation must be exactly 'internal-beta'.");
  });

  it('requires staging-only public configuration and one expected signer', () => {
    expect(workflow).toContain('environment: internal-beta');
    expect(workflow).toContain('GOALFLOW_STAGING_APP_ORIGIN');
    expect(workflow).toContain('GOALFLOW_STAGING_SUPABASE_URL');
    expect(workflow).toContain('GOALFLOW_STAGING_SUPABASE_PUBLISHABLE_KEY');
    expect(workflow).toContain('sb_publishable_*');
    expect(workflow).toContain('mapfile -t signer_fingerprints');
    expect(workflow).toContain('[ "${#signer_fingerprints[@]}" -ne 1 ]');
    expect(workflow).toContain('ANDROID_EXPECT_SIGNED=1 bash android-native/scripts/verify-signing-strict.sh "$apk"');
    expect(workflow).toContain('GOALFLOW_APK_LABEL=INTERNAL-BETA bash android-native/scripts/diagnose-apk.sh "$apk"');
    expect(workflow).not.toContain('SUPABASE_SECRET_KEY');
    expect(workflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('retains a verified checksum and source provenance without publishing a release', () => {
    expect(workflow).toContain('sha256sum --check "$apk.sha256"');
    expect(workflow).toContain('branch=integration/beta');
    expect(workflow).toContain('channel=internal-beta');
    expect(workflow).toContain('goalflow-native-signed-internal-beta');
    expect(workflow).not.toContain('softprops/action-gh-release');
    expect(workflow.match(/set -euo pipefail/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
