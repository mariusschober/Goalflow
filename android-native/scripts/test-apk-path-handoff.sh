#!/usr/bin/env sh
set -eu

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
workspace="$work_dir/workspace"
runner_temp="$work_dir/runner-temp"
apk_dir="$workspace/android-native/app/build/outputs/apk/production/debug"
mkdir -p "$apk_dir" "$runner_temp"

apk="$apk_dir/app-production-debug.apk"
printf '%s\n' 'test-only apk' > "$apk"
found_apk="$(find "$apk_dir" -name '*.apk' -print -quit)"
case "$found_apk" in
    /*) ;;
    *) exit 1 ;;
esac
[ "$found_apk" = "$apk" ]
printf '%s\n' "$found_apk" > "$runner_temp/goalflow-production-debug-apk"

(
    cd "$work_dir"
    handed_off="$(cat "$runner_temp/goalflow-production-debug-apk")"
    [ -n "$handed_off" ] && [ -f "$handed_off" ]
)

printf '%s\n' 'APK_PATH_HANDOFF=PASS'
