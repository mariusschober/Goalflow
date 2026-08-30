#!/usr/bin/env sh
set -eu

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
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
export GOALFLOW_PRODUCTION_DEBUG_APK="$found_apk"
(
    cd "$work_dir"
    apk="$GOALFLOW_PRODUCTION_DEBUG_APK"
    [ -n "$apk" ] && [ -f "$apk" ] && cmp "$apk" "$found_apk"
)

printf '%s\n' 'APK_PATH_HANDOFF=PASS'
