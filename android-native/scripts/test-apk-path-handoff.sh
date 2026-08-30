#!/usr/bin/env sh
set -eu

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
workflow="$repo_root/.github/workflows/ci.yml"
[ -f "$workflow" ]
grep -F 'apk="${{ github.workspace }}/android-native/app/build/outputs/apk/production/debug/app-production-debug.apk"' "$workflow" >/dev/null
if grep -F 'apk="$GOALFLOW_PRODUCTION_DEBUG_APK"' "$workflow" >/dev/null; then
    echo "Workflow still depends on an action-internal environment handoff." >&2
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

action_apk="$workspace/android-native/app/build/outputs/apk/production/debug/app-production-debug.apk"
 [ "$action_apk" = "$apk" ]
(
    cd "$work_dir"
    apk="$action_apk"
    [ -n "$apk" ] && [ -f "$apk" ] && cmp "$apk" "$found_apk"
)

printf '%s\n' 'APK_PATH_HANDOFF=PASS'
