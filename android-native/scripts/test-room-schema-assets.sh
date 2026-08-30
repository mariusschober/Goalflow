#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
build_gradle="$repo_root/android-native/app/build.gradle"
schema_dir="$repo_root/android-native/app/schemas/com.mariusschober.goalflow.nativeapp.data.GoalflowDatabase"
[ -f "$build_gradle" ]
[ -d "$schema_dir" ]
grep -F 'assets.srcDirs += "$projectDir/schemas"' "$build_gradle" >/dev/null
for version in 1 2 3 4 5 6 7 8; do
    [ -f "$schema_dir/$version.json" ]
done

printf '%s\n' 'ROOM_SCHEMA_ASSETS=PASS'
