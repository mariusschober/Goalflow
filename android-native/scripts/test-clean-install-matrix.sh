#!/usr/bin/env bash
set -euo pipefail

if [[ "${GOALFLOW_ALLOW_TEST_APP_DATA_ERASE:-0}" != "1" ]]; then
  echo 'CLEAN_INSTALL_MATRIX=FAIL (set GOALFLOW_ALLOW_TEST_APP_DATA_ERASE=1 only on a nonproduction test device)' >&2
  exit 1
fi

production_apk="${1:-android-native/app/build/outputs/apk/production/release/app-production-release.apk}"
sandbox_apk="${2:-android-native/app/build/outputs/apk/sandbox/debug/app-sandbox-debug.apk}"
for apk in "$production_apk" "$sandbox_apk"; do
  [[ -f "$apk" ]] || { echo "CLEAN_INSTALL_MATRIX=FAIL (missing APK: $apk)" >&2; exit 1; }
done

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
find_android_tool() {
  local name="$1"
  local result=""
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return
  fi
  [[ -n "$sdk_root" && -d "$sdk_root/build-tools" ]] || return 1
  while IFS= read -r candidate; do
    [[ -x "$candidate" ]] && result="$candidate"
  done < <(find "$sdk_root/build-tools" -type f -name "$name" -print 2>/dev/null | sort -V)
  [[ -n "$result" ]] || return 1
  printf '%s\n' "$result"
}

aapt_bin="$(find_android_tool aapt)" || { echo 'CLEAN_INSTALL_MATRIX=FAIL (aapt unavailable)' >&2; exit 1; }
apksigner_bin="$(find_android_tool apksigner)" || { echo 'CLEAN_INSTALL_MATRIX=FAIL (apksigner unavailable)' >&2; exit 1; }
adb_bin="$(command -v adb || true)"
[[ -n "$adb_bin" ]] || { echo 'CLEAN_INSTALL_MATRIX=FAIL (adb unavailable)' >&2; exit 1; }

adb_command=("$adb_bin")
if [[ -n "${GOALFLOW_ANDROID_SERIAL:-}" ]]; then
  adb_command+=( -s "$GOALFLOW_ANDROID_SERIAL" )
fi
device_state="$("${adb_command[@]}" get-state 2>/dev/null || true)"
[[ "$device_state" == 'device' ]] || { echo 'CLEAN_INSTALL_MATRIX=FAIL (test device unavailable)' >&2; exit 1; }

check_install() {
  local apk="$1"
  local label="$2"
  local badging package_name installed_packages launch_output certificate_output

  badging="$("$aapt_bin" dump badging "$apk")"
  package_name="$(sed -n "s/^package: name='\([^']*\)'.*/\1/p" <<<"$badging")"
  [[ -n "$package_name" && "$package_name" != *$'\n'* ]] || {
    echo "$label: FAIL (package identity unavailable)" >&2
    return 1
  }

  "${adb_command[@]}" uninstall "$package_name" >/dev/null 2>&1 || true
  "${adb_command[@]}" install "$apk" >/dev/null
  installed_packages="$("${adb_command[@]}" shell pm list packages)"
  grep -Fq "package:$package_name" <<<"$installed_packages" || {
    echo "$label: FAIL (package not installed)" >&2
    return 1
  }

  launch_output="$("${adb_command[@]}" shell am start -W -n "$package_name/com.mariusschober.goalflow.nativeapp.MainActivity")"
  grep -Fq 'Status: ok' <<<"$launch_output" || {
    printf '%s\n' "$launch_output" >&2
    echo "$label: FAIL (first launch failed)" >&2
    return 1
  }

  certificate_output="$("$apksigner_bin" verify --verbose --print-certs "$apk")"
  if [[ "$label" == productionRelease && "$certificate_output" == *'CN=Android Debug'* ]]; then
    echo "$label: FAIL (debug certificate)" >&2
    return 1
  fi

  bash android-native/scripts/diagnose-apk.sh "$apk"
  "${adb_command[@]}" uninstall "$package_name" >/dev/null
  echo "$label: CLEAN_INSTALL_PASS"
}

check_install "$production_apk" productionRelease
check_install "$sandbox_apk" sandboxDebug
echo 'CLEAN_INSTALL_MATRIX=PASS'
