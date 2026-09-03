#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
project_file="$repo_root/macos-native/GoalflowMac.xcodeproj/project.pbxproj"
[ -f "$project_file" ] || { echo "Checked-in Xcode project file is missing." >&2; exit 1; }

source_list="$(mktemp "${TMPDIR:-/tmp}/goalflow-xcode-sources.XXXXXX")"
cleanup() {
  rm -f "$source_list"
}
trap cleanup EXIT
(cd "$repo_root" && rg --files macos-native/GoalflowMac macos-native/GoalflowMacTests -g '*.swift' | sort) \
  > "$source_list"
[ -s "$source_list" ] || { echo "No checked-in macOS Swift sources were discovered." >&2; exit 1; }
duplicate_names="$(awk -F/ '{ print $NF }' "$source_list" | uniq -d)"
[ -z "$duplicate_names" ] || {
  echo "Duplicate Swift basenames make Xcode membership ambiguous." >&2
  exit 1
}

missing=0
while IFS= read -r source; do
  name="${source##*/}"
  if ! rg -F "/* $name in Sources */" "$project_file" | awk 'END { exit(NR < 2) }'; then
    echo "Checked-in Xcode project does not compile $source" >&2
    missing=1
  fi
done < "$source_list"

if [ "$missing" -ne 0 ]; then
  exit 1
fi

echo "macOS Xcode source membership gate PASS"
