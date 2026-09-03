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
const apkRunner = readFileSync(
  new URL('../android-native/scripts/run-instrumentation-apk.sh', import.meta.url),
  'utf8'
);
const emulatorGate = readFileSync(
  new URL('../android-native/scripts/run-emulator-gate.sh', import.meta.url),
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

  it('runs the compiled instrumentation APK directly with an exact test count', () => {
    expect(apkRunner).toContain('shell am instrument -w');
    expect(apkRunner).toContain('OK ($expected_count tests)');
    expect(apkRunner).toContain('verify-instrumentation-target.sh');
    expect(emulatorGate).toContain(
      'run-instrumentation-apk.sh" "$current_apk" "$current_test_apk" 7'
    );
    expect(emulatorGate).not.toContain('connectedProductionDebugAndroidTest');
    expect(workflow).toContain('Run instrumentation APK runner regression test');
  });
});
