#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
project_file="$repo_root/macos-native/GoalflowMac.xcodeproj/project.pbxproj"

missing=0
while IFS= read -r source; do
  name="${source##*/}"
  if ! rg -Fq "/* $name" "$project_file"; then
    echo "Checked-in Xcode project omits $source" >&2
    missing=1
  fi
done < <(cd "$repo_root" && rg --files macos-native/GoalflowMac macos-native/GoalflowMacTests -g '*.swift' | sort)

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "macOS Xcode source membership gate PASS"
