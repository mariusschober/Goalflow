#!/usr/bin/env bash
set -euo pipefail

# Strict signing verification. A caller that supplies an APK always receives a
# real verification result; a missing path is never replaced with another APK.
apk="${1:-}"
expect_signed="${ANDROID_EXPECT_SIGNED:-0}"

if [[ -n "$apk" && ! -f "$apk" ]]; then
  echo "SIGNING=FAIL (requested APK does not exist)" >&2
  exit 1
fi
if [[ -z "$apk" ]]; then
  apk="$(find android-native/app/build/outputs/apk/production/release -type f -name '*.apk' -print -quit 2>/dev/null || true)"
fi
if [[ -z "$apk" || ! -f "$apk" ]]; then
  if [[ "$expect_signed" == "1" ]]; then
    echo "SIGNING=FAIL (release context expects a signed APK)" >&2
    exit 1
  fi
  echo "SIGNING=SKIP (no APK requested in this non-release context)"
  exit 0
fi

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
apksigner_bin=""
if command -v apksigner >/dev/null 2>&1; then
  apksigner_bin="$(command -v apksigner)"
elif [[ -n "$sdk_root" && -d "$sdk_root/build-tools" ]]; then
  while IFS= read -r candidate; do
    [[ -x "$candidate" ]] && apksigner_bin="$candidate"
  done < <(find "$sdk_root/build-tools" -type f -name apksigner -print 2>/dev/null | sort -V)
fi
if [[ -z "$apksigner_bin" ]]; then
  echo "SIGNING=FAIL (apksigner is unavailable)" >&2
  exit 1
fi

certificate_output="$(mktemp)"
trap 'rm -f "$certificate_output"' EXIT
if ! "$apksigner_bin" verify --verbose --print-certs "$apk" >"$certificate_output" 2>&1; then
  cat "$certificate_output" >&2
  echo "SIGNING=FAIL (apksigner rejected the APK)" >&2
  exit 1
fi
cat "$certificate_output"

if grep -Fq 'CN=Android Debug' "$certificate_output"; then
  if [[ "$expect_signed" == "1" ]]; then
    echo "SIGNING=FAIL (debug certificate in a release context)" >&2
    exit 1
  fi
  echo "SIGNING=INFO (valid debug certificate in a non-release context)"
  exit 0
fi

echo "SIGNING=PASS (APK signature verified; certificate is not the Android debug certificate)"
