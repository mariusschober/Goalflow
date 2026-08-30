#!/usr/bin/env sh
set -eu

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
workflow="$repo_root/.github/workflows/ci.yml"
[ -f "$workflow" ]
grep -F 'working-directory: ${{ github.workspace }}' "$workflow" >/dev/null
grep -F 'apk="android-native/app/build/outputs/apk/production/debug/app-production-debug.apk"' "$workflow" >/dev/null
if grep -F 'apk="$GOALFLOW_PRODUCTION_DEBUG_APK"' "$workflow" >/dev/null; then
    echo "Workflow still depends on an action-internal environment handoff." >&2
    exit 1
fi
if grep -F 'apk="${{ github.workspace }}/android-native/app/build/outputs/apk/production/debug/app-production-debug.apk"' "$workflow" >/dev/null; then
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
