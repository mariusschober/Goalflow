#!/usr/bin/env sh
set -eu

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
workflow="$repo_root/.github/workflows/ci.yml"
[ -f "$workflow" ]
emulator_block="$(sed -n '/- name: Run native emulator journey/,/- name: Upload native production debug APK/p' "$workflow")"
[ -n "$emulator_block" ]
printf '%s\n' "$emulator_block" | grep -F 'working-directory: ${{ github.workspace }}' >/dev/null
printf '%s\n' "$emulator_block" | grep -F 'set -eu' >/dev/null
printf '%s\n' "$emulator_block" | grep -F 'apk="android-native/app/build/outputs/apk/production/debug/app-production-debug.apk"' >/dev/null
printf '%s\n' "$emulator_block" | grep -F '[ -n "$apk" ] && [ -f "$apk" ] || {' >/dev/null
printf '%s\n' "$emulator_block" | grep -F 'android-native/scripts/diagnose-apk.sh "$apk"' >/dev/null
if printf '%s\n' "$emulator_block" | grep -F 'set -euo pipefail' >/dev/null; then
    echo "The emulator action runs its script with POSIX sh; Bash pipefail is not valid there." >&2
    exit 1
fi
if printf '%s\n' "$emulator_block" | grep -F 'apk="$GOALFLOW_PRODUCTION_DEBUG_APK"' >/dev/null; then
    echo "Workflow still depends on an action-internal environment handoff." >&2
    exit 1
fi
if printf '%s\n' "$emulator_block" | grep -F 'apk="${{ github.workspace }}/android-native/app/build/outputs/apk/production/debug/app-production-debug.apk"' >/dev/null; then
    echo "Workflow still depends on an absolute host path inside the action." >&2
    exit 1
fi

workspace="$work_dir/workspace"
apk_dir="$workspace/android-native/app/build/outputs/apk/production/debug"
mkdir -p "$apk_dir"

apk="$apk_dir/app-production-debug.apk"
printf '%s\n' 'test-only apk' > "$apk"
found_apk="$(find "$apk_dir" -name '*.apk' -print -quit)"
case "$found_apk" in
    /*) ;;
    *) exit 1 ;;
esac
[ "$found_apk" = "$apk" ]

action_working_dir="$workspace"
action_relative_apk="android-native/app/build/outputs/apk/production/debug/app-production-debug.apk"
(
    cd "$action_working_dir"
    apk="$action_relative_apk"
    [ -n "$apk" ] && [ -f "$apk" ] && cmp "$apk" "$found_apk"
)

printf '%s\n' 'APK_PATH_HANDOFF=PASS'
