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

  it('models process death between the preserved seed and cold-launch upgrade', () => {
    const uninstallSeed = upgrade.indexOf('uninstall "$test_package"');
    const stopPreserved = upgrade.indexOf('shell am force-stop "$old_package"', uninstallSeed);
    const launchPreserved = upgrade.indexOf('shell am start -W -n "$old_package/', stopPreserved);
    const stopBeforeUpgrade = upgrade.indexOf('shell am force-stop "$old_package"', stopPreserved + 1);
    const installUpgrade = upgrade.indexOf('install -r "$new_apk"', stopBeforeUpgrade);

    expect(uninstallSeed).toBeGreaterThan(-1);
    expect(stopPreserved).toBeGreaterThan(uninstallSeed);
    expect(launchPreserved).toBeGreaterThan(stopPreserved);
    expect(stopBeforeUpgrade).toBeGreaterThan(launchPreserved);
    expect(installUpgrade).toBeGreaterThan(stopBeforeUpgrade);
    expect(upgrade).toContain('UPGRADE_MATRIX=FAIL (preserved-version cold launch failed)');
    expect(upgrade).toContain('UPGRADE_MATRIX=FAIL (upgraded application cold launch failed)');
  });
});
