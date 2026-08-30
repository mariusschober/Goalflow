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
emulator_apk="$runner_temp/goalflow-production-debug.apk"
cp "$found_apk" "$emulator_apk"
printf '%s\n' "$emulator_apk" > "$runner_temp/goalflow-production-debug-apk-path"

(
    cd "$work_dir"
    handed_off="$(cat "$runner_temp/goalflow-production-debug-apk-path")"
    [ -n "$handed_off" ] && [ -f "$handed_off" ] && cmp "$handed_off" "$emulator_apk"
)

printf '%s\n' 'APK_PATH_HANDOFF=PASS'
