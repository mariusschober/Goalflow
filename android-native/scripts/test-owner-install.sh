#!/usr/bin/env bash
set -euo pipefail

apk="${1:-android-native/app/build/outputs/apk/production/release/app-production-release.apk}"
[[ -f "$apk" ]] || { echo "OWNER_INSTALL=FAIL (missing release APK: $apk)" >&2; exit 1; }

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
find_android_tool() {
  local name="$1"
  local result=""
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return; fi
  [[ -n "$sdk_root" && -d "$sdk_root/build-tools" ]] || return 1
  while IFS= read -r candidate; do [[ -x "$candidate" ]] && result="$candidate"; done \
    < <(find "$sdk_root/build-tools" -type f -name "$name" -print 2>/dev/null | sort -V)
  [[ -n "$result" ]] || return 1
  printf '%s\n' "$result"
}
aapt_bin="$(find_android_tool aapt)" || { echo 'OWNER_INSTALL=FAIL (aapt unavailable)' >&2; exit 1; }
apksigner_bin="$(find_android_tool apksigner)" || { echo 'OWNER_INSTALL=FAIL (apksigner unavailable)' >&2; exit 1; }
adb_bin="$(command -v adb || true)"
[[ -n "$adb_bin" ]] || { echo 'OWNER_INSTALL=FAIL (adb unavailable)' >&2; exit 1; }
adb_command=("$adb_bin")
if [[ -n "${GOALFLOW_ANDROID_SERIAL:-}" ]]; then adb_command+=( -s "$GOALFLOW_ANDROID_SERIAL" ); fi
[[ "$("${adb_command[@]}" get-state 2>/dev/null || true)" == device ]] || {
  echo 'OWNER_INSTALL=FAIL (selected device unavailable)' >&2
  exit 1
}

badging="$("$aapt_bin" dump badging "$apk")"
package_name="$(sed -n "s/^package: name='\([^']*\)'.*/\1/p" <<<"$badging")"
version_code="$(sed -n "s/^package:.*versionCode='\([^']*\)'.*/\1/p" <<<"$badging")"
version_name="$(sed -n "s/^package:.*versionName='\([^']*\)'.*/\1/p" <<<"$badging")"
[[ -n "$package_name" && -n "$version_code" && -n "$version_name" ]] || {
  echo 'OWNER_INSTALL=FAIL (APK identity unavailable)' >&2
  exit 1
}

certificate_output="$("$apksigner_bin" verify --verbose --print-certs "$apk")"
[[ "$certificate_output" != *'CN=Android Debug'* ]] || {
  echo 'OWNER_INSTALL=FAIL (debug certificate)' >&2
  exit 1
}

"${adb_command[@]}" install -r "$apk" >/dev/null
installed_packages="$("${adb_command[@]}" shell pm list packages)"
grep -Fq "package:$package_name" <<<"$installed_packages" || {
  echo 'OWNER_INSTALL=FAIL (package not installed)' >&2
  exit 1
}

"${adb_command[@]}" logcat -c
start_output="$("${adb_command[@]}" shell am start -W -n "$package_name/com.mariusschober.goalflow.nativeapp.MainActivity")"
grep -Fq 'Status: ok' <<<"$start_output" || { printf '%s\n' "$start_output" >&2; exit 1; }
total_ms="$(sed -n 's/^TotalTime: //p' <<<"$start_output")"
sleep 2
logcat_output="$("${adb_command[@]}" logcat -d)"
if grep -E "AndroidRuntime.*$package_name|FATAL.*$package_name" <<<"$logcat_output" >/dev/null; then
  echo 'OWNER_INSTALL=FAIL (application crash in logcat)' >&2
  exit 1
fi

checksum="$(sha256sum "$apk" | awk '{print $1}')"
printf 'PACKAGE=%s\nVERSION_CODE=%s\nVERSION_NAME=%s\nCOLD_START_MS=%s\nAPK_SHA256=%s\n' \
  "$package_name" "$version_code" "$version_name" "${total_ms:-unknown}" "$checksum"
echo 'OWNER_INSTALL=PASS'
