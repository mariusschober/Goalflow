#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
gradle="$repo_root/android-native/gradlew"
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

blocked_key="sb_"
blocked_key+="secret_test_only"
if "$gradle" -p "$repo_root/android-native" help \
    -PgoalflowSupabasePublishableKey="$blocked_key" >"$log_file" 2>&1; then
  echo "Android configuration accepted a Supabase server secret." >&2
  exit 1
fi
grep -F "A Supabase server secret cannot be embedded in an Android build." "$log_file" >/dev/null

"$gradle" -p "$repo_root/android-native" help \
  -PgoalflowSupabasePublishableKey="sb_publishable_goalflow_test" >/dev/null

echo "ANDROID_PUBLIC_KEY_GATE=PASS"
