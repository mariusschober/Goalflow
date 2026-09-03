#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname "$0")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
tool_dir="$work_dir/android-sdk/build-tools/35.0.0"
mkdir -p "$tool_dir"
apk="$work_dir/release.apk"
printf '%s\n' 'synthetic apk fixture' >"$apk"

write_signer() {
  local exit_code="$1"
  local certificate="$2"
  {
    printf '%s\n' '#!/usr/bin/env bash'
    printf 'printf %s\\n %q\n' "'%s'" "$certificate"
    printf 'exit %s\n' "$exit_code"
  } >"$tool_dir/apksigner"
  chmod +x "$tool_dir/apksigner"
}

write_signer 2 'synthetic signer failure'
if PATH="$tool_dir:$PATH" ANDROID_HOME="$work_dir/android-sdk" ANDROID_EXPECT_SIGNED=1 \
  bash "$script_dir/verify-signing-strict.sh" "$apk" >/dev/null 2>&1; then
  echo 'SIGNING_GATE=FAIL (apksigner failure was masked)' >&2
  exit 1
fi

write_signer 0 'Signer #1 certificate DN: CN=Android Debug,O=Android,C=US'
if PATH="$tool_dir:$PATH" ANDROID_HOME="$work_dir/android-sdk" ANDROID_EXPECT_SIGNED=1 \
  bash "$script_dir/verify-signing-strict.sh" "$apk" >/dev/null 2>&1; then
  echo 'SIGNING_GATE=FAIL (debug certificate was accepted)' >&2
  exit 1
fi

write_signer 0 'Signer #1 certificate DN: CN=Goalflow Beta,O=Goalflow,C=DE'
release_output="$(PATH="$tool_dir:$PATH" ANDROID_HOME="$work_dir/android-sdk" ANDROID_EXPECT_SIGNED=1 \
  bash "$script_dir/verify-signing-strict.sh" "$apk")"
grep -Fq 'SIGNING=PASS' <<<"$release_output"

echo 'SIGNING_GATE=PASS'
