#!/usr/bin/env bash
set -euo pipefail

# This command proves only the package-level install transition. It exits
# nonzero after that transition until a durable-data probe is implemented; a
# Room migration test is not a substitute for upgrading a real installed app.
if [[ "${GOALFLOW_ALLOW_TEST_APP_DATA_ERASE:-0}" != "1" ]]; then
  echo 'UPGRADE_MATRIX=FAIL (set GOALFLOW_ALLOW_TEST_APP_DATA_ERASE=1 only on a nonproduction test device)' >&2
  exit 1
fi

old_apk="${1:-${GOALFLOW_UPGRADE_FROM_APK:-}}"
new_apk="${2:-android-native/app/build/outputs/apk/production/release/app-production-release.apk}"
[[ -n "$old_apk" && -f "$old_apk" ]] || { echo 'UPGRADE_MATRIX=FAIL (a preserved prior production APK is required)' >&2; exit 1; }
[[ -f "$new_apk" ]] || { echo "UPGRADE_MATRIX=FAIL (new APK missing: $new_apk)" >&2; exit 1; }

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
aapt_bin=""
if command -v aapt >/dev/null 2>&1; then
  aapt_bin="$(command -v aapt)"
elif [[ -n "$sdk_root" && -d "$sdk_root/build-tools" ]]; then
  while IFS= read -r candidate; do
    [[ -x "$candidate" ]] && aapt_bin="$candidate"
  done < <(find "$sdk_root/build-tools" -type f -name aapt -print 2>/dev/null | sort -V)
fi
[[ -n "$aapt_bin" ]] || { echo 'UPGRADE_MATRIX=FAIL (aapt unavailable)' >&2; exit 1; }
adb_bin="$(command -v adb || true)"
[[ -n "$adb_bin" ]] || { echo 'UPGRADE_MATRIX=FAIL (adb unavailable)' >&2; exit 1; }
adb_command=("$adb_bin")
if [[ -n "${GOALFLOW_ANDROID_SERIAL:-}" ]]; then
  adb_command+=( -s "$GOALFLOW_ANDROID_SERIAL" )
fi
[[ "$("${adb_command[@]}" get-state 2>/dev/null || true)" == device ]] || {
  echo 'UPGRADE_MATRIX=FAIL (test device unavailable)' >&2
  exit 1
}

old_badging="$("$aapt_bin" dump badging "$old_apk")"
new_badging="$("$aapt_bin" dump badging "$new_apk")"
old_package="$(sed -n "s/^package: name='\([^']*\)'.*/\1/p" <<<"$old_badging")"
new_package="$(sed -n "s/^package: name='\([^']*\)'.*/\1/p" <<<"$new_badging")"
old_version="$(sed -n "s/^package:.*versionCode='\([^']*\)'.*/\1/p" <<<"$old_badging")"
new_version="$(sed -n "s/^package:.*versionCode='\([^']*\)'.*/\1/p" <<<"$new_badging")"

[[ -n "$old_package" && "$old_package" == "$new_package" ]] || {
  echo "UPGRADE_MATRIX=FAIL (package mismatch: ${old_package:-unknown} -> ${new_package:-unknown}; simulation is forbidden)" >&2
  exit 1
}
[[ "$old_version" =~ ^[0-9]+$ && "$new_version" =~ ^[0-9]+$ && "$old_version" -lt "$new_version" ]] || {
  echo "UPGRADE_MATRIX=FAIL (versionCode must increase: ${old_version:-unknown} -> ${new_version:-unknown})" >&2
  exit 1
}

"${adb_command[@]}" uninstall "$old_package" >/dev/null 2>&1 || true
"${adb_command[@]}" install "$old_apk" >/dev/null
old_launch="$("${adb_command[@]}" shell am start -W -n "$old_package/com.mariusschober.goalflow.nativeapp.MainActivity")"
grep -Fq 'Status: ok' <<<"$old_launch" || { printf '%s\n' "$old_launch" >&2; exit 1; }
"${adb_command[@]}" install -r "$new_apk" >/dev/null
new_launch="$("${adb_command[@]}" shell am start -W -n "$new_package/com.mariusschober.goalflow.nativeapp.MainActivity")"
grep -Fq 'Status: ok' <<<"$new_launch" || { printf '%s\n' "$new_launch" >&2; exit 1; }

echo 'UPGRADE_INSTALL_LAUNCH=PASS'
echo 'UPGRADE_DATA_PRESERVATION=NOT_PROVEN (durable-data probe required before beta)' >&2
exit 1
