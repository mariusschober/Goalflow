import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const upgrade = readFileSync(
  new URL('../android-native/scripts/test-upgrade-matrix.sh', import.meta.url),
  'utf8'
);
const verifier = readFileSync(
  new URL('../android-native/scripts/verify-instrumentation-target.sh', import.meta.url),
  'utf8'
);
const workflow = readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8'
);

describe('installed Android upgrade instrumentation contract', () => {
  it('uses Package Manager runtime metadata instead of optional aapt badging output', () => {
    expect(upgrade).toContain('shell pm list instrumentation "$old_package"');
    expect(upgrade).toContain('verify-instrumentation-target.sh');
    expect(upgrade).not.toContain("targetPackage='");
    expect(verifier).toContain('listing" != "$expected');
  });

  it('executes the fail-closed target regression before emulator work', () => {
    expect(workflow).toContain('Run installed instrumentation target regression test');
    expect(workflow).toContain('sh android-native/scripts/test-instrumentation-target.sh');
  });
});
