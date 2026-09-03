#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
project_file="$repo_root/macos-native/GoalflowMac.xcodeproj/project.pbxproj"

missing=0
while IFS= read -r source; do
  name="${source##*/}"
  if ! rg -F "/* $name in Sources */" "$project_file" | awk 'END { exit(NR < 2) }'; then
    echo "Checked-in Xcode project does not compile $source" >&2
    missing=1
  fi
done < <(cd "$repo_root" && rg --files macos-native/GoalflowMac macos-native/GoalflowMacTests -g '*.swift' | sort)

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "macOS Xcode source membership gate PASS"
