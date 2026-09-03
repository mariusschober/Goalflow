#!/usr/bin/env bash
set -euo pipefail

if [[ "${GOALFLOW_ALLOW_TEST_APP_DATA_ERASE:-0}" != "1" ]]; then
  echo 'APP_LAUNCH=FAIL (test-device process control was not explicitly authorized)' >&2
  exit 1
fi

package_name="${1:-}"
activity_name="${2:-}"
result_label="${3:-APP_LAUNCH}"
attempts="${GOALFLOW_LAUNCH_POLL_ATTEMPTS:-45}"
package_pattern='^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$'
activity_pattern='^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$'

[[ "$package_name" =~ $package_pattern ]] || {
  echo "$result_label=FAIL (invalid application package)" >&2
  exit 1
}
[[ "$activity_name" =~ $activity_pattern ]] || {
  echo "$result_label=FAIL (invalid activity class)" >&2
  exit 1
}
[[ "$result_label" =~ ^[A-Z][A-Z0-9_]*$ ]] || {
  echo 'APP_LAUNCH=FAIL (invalid result label)' >&2
  exit 1
}
[[ "$attempts" =~ ^[1-9][0-9]*$ && "$attempts" -le 60 ]] || {
  echo "$result_label=FAIL (invalid launch poll bound)" >&2
  exit 1
}

adb_bin="$(command -v adb || true)"
timeout_bin="$(command -v timeout || true)"
[[ -n "$adb_bin" ]] || { echo "$result_label=FAIL (adb unavailable)" >&2; exit 1; }
[[ -n "$timeout_bin" ]] || { echo "$result_label=FAIL (timeout unavailable)" >&2; exit 1; }

adb_command=("$adb_bin")
if [[ -n "${GOALFLOW_ANDROID_SERIAL:-}" ]]; then
  adb_command+=( -s "$GOALFLOW_ANDROID_SERIAL" )
fi
[[ "$("$timeout_bin" 10 "${adb_command[@]}" get-state 2>/dev/null || true)" == device ]] || {
  echo "$result_label=FAIL (test device unavailable)" >&2
  exit 1
}

component="$package_name/$activity_name"
"$timeout_bin" 15 "${adb_command[@]}" shell am force-stop "$package_name"
start_output="$("$timeout_bin" 20 "${adb_command[@]}" shell am start -n "$component" | tr -d '\r')" || {
  echo "$result_label=FAIL (component start command failed)" >&2
  exit 1
}
grep -Fq 'Starting: Intent' <<<"$start_output" || {
  printf '%s\n' "$start_output" >&2
  echo "$result_label=FAIL (component start was not accepted)" >&2
  exit 1
}

last_process='absent'
last_resumed='other'
last_frames='unavailable'
for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  process_output="$("$timeout_bin" 5 "${adb_command[@]}" shell pidof "$package_name" 2>/dev/null | tr -d '\r' || true)"
  activity_output="$("$timeout_bin" 5 "${adb_command[@]}" shell dumpsys activity activities 2>/dev/null | tr -d '\r' || true)"
  resumed_output="$(grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' <<<"$activity_output" || true)"
  gfx_output="$("$timeout_bin" 5 "${adb_command[@]}" shell dumpsys gfxinfo "$package_name" 2>/dev/null | tr -d '\r' || true)"
  frames="$(sed -n -E 's/^[[:space:]]*Total frames rendered:[[:space:]]*([0-9]+).*/\1/p' <<<"$gfx_output" | head -n 1)"

  [[ "$process_output" =~ ^[0-9]+([[:space:]][0-9]+)*$ ]] && last_process='present' || last_process='absent'
  grep -Fq "$component" <<<"$resumed_output" && last_resumed='expected' || last_resumed='other'
  [[ "$frames" =~ ^[0-9]+$ ]] && last_frames="$frames" || last_frames='unavailable'

  if [[ "$last_process" == present && "$last_resumed" == expected && "$last_frames" =~ ^[0-9]+$ && "$last_frames" -gt 0 ]]; then
    echo "${result_label}_FRAMES=$last_frames"
    echo "$result_label=PASS"
    exit 0
  fi

  if ((attempt < attempts)); then
    sleep 1
  fi
done

echo "$result_label=FAIL (cold-started component was not live, resumed, and rendered; process=$last_process resumed=$last_resumed frames=$last_frames)" >&2
exit 1
