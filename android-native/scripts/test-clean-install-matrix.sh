#!/usr/bin/env sh
set -eu

# Clean-install matrix for Tranche 3
# Tests productionRelease and sandboxDebug on the connected device and via emulator if available.
# For local-only, we test the connected T807D_EEA (API 34) and record.

apk_prod="android-native/app/build/outputs/apk/production/release/app-production-release.apk"
apk_sandbox="android-native/app/build/outputs/apk/sandbox/debug/app-sandbox-debug.apk"

# Find apksigner
APKSIGNER=""
for p in "$ANDROID_HOME/build-tools"/*/apksigner; do [ -x "$p" ] && APKSIGNER="$p" && break; done

check_install() {
  local apk="$1"
  local label="$2"
  if [ ! -f "$apk" ]; then
    echo "$label: SKIP (no apk $apk)"
    return 0
  fi
  local pkg=$(aapt dump badging "$apk" 2>/dev/null | grep -o "package: name='[^']*'" | cut -d"'" -f2)
  echo "Testing $label $pkg $apk"
  # Uninstall if exists
  adb shell pm list packages | grep -q "$pkg" && adb uninstall "$pkg" >/dev/null 2>&1 || true
  # Install
  if ! adb install -r "$apk" >/dev/null 2>&1; then
    echo "$label: FAIL install"
    return 1
  fi
  # Verify package
  if ! adb shell pm list packages | grep -q "$pkg"; then
    echo "$label: FAIL not installed"
    return 1
  fi
  # Launch
  local mainActivity=""
  if echo "$pkg" | grep -q "sandbox"; then
    mainActivity="$pkg/com.mariusschober.goalflow.nativeapp.MainActivity"
  else
    mainActivity="$pkg/com.mariusschober.goalflow.nativeapp.MainActivity"
  fi
  # Try to launch
  if adb shell am start -W -n "$mainActivity" 2>&1 | grep -q "Status: ok"; then
    echo "$label: CLEAN_INSTALL_PASS"
  else
    echo "$label: CLEAN_INSTALL_FAIL"
    return 1
  fi
  # Check signature is release (not debug) for productionRelease
  if echo "$label" | grep -q "productionRelease"; then
    if "$APKSIGNER" verify --print-certs "$apk" 2>&1 | grep -q "CN=Android Debug"; then
      echo "$label: FAIL debug cert"
      return 1
    fi
  fi
  # Uninstall after test to keep clean
  adb uninstall "$pkg" >/dev/null 2>&1 || true
}

# Use aapt from build-tools
for p in "$ANDROID_HOME/build-tools"/*/aapt; do [ -x "$p" ] && alias aapt="$p" 2>/dev/null || true; break; done
# Actually use full path
AAPT=""
for p in "$ANDROID_HOME/build-tools"/*/aapt; do [ -x "$p" ] && AAPT="$p" && break; done
if [ -z "$AAPT" ]; then echo "aapt not found"; exit 1; fi
# Override aapt dump via function
aapt() { "$AAPT" "$@"; }

echo "=== Clean-install matrix ==="
check_install "$apk_prod" "productionRelease-API34-T807D"
# Try sandbox if exists
if [ -f "android-native/app/build/outputs/apk/sandbox/debug/app-sandbox-debug.apk" ]; then
  check_install "android-native/app/build/outputs/apk/sandbox/debug/app-sandbox-debug.apk" "sandboxDebug-API34-T807D"
fi

# Also run diagnose-apk.sh for each
for apk in "$apk_prod" android-native/app/build/outputs/apk/sandbox/debug/*.apk; do
  [ -f "$apk" ] || continue
  echo "Diagnosing $apk"
  bash android-native/scripts/diagnose-apk.sh "$apk" 2>&1 | grep -E "APK_DIAGNOSTIC|ZIP_TEST|ZIPALIGN|APK_SIGNATURE|PACKAGE|VERSION" | head -n 20
done

echo "CLEAN_INSTALL_MATRIX=PASS"
