#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
mac_root="$repo_root/macos-native"
info_plist="$mac_root/GoalflowMac/Resources/Info.plist"

fail() {
  echo "macOS public configuration gate failed: $1" >&2
  exit 1
}

if rg -l --hidden --glob '*.plist' --glob '*.xcconfig' --glob '*.entitlements' \
  '(?i)(sb_secret_[A-Za-z0-9_-]{20,}|SUPABASE_(SERVICE_ROLE|SECRET_KEY)[[:space:]]*=)' \
  "$mac_root" >/dev/null; then
  fail "a server-only Supabase credential pattern is present in distributable configuration"
fi

rg -q '<key>SUPABASE_PUBLISHABLE_KEY</key><string>\$\(SUPABASE_PUBLISHABLE_KEY\)</string>' "$info_plist" \
  || fail "Info.plist does not use the public publishable-key build setting"
rg -q '<key>API_ORIGIN</key><string>\$\(API_ORIGIN\)</string>' "$info_plist" \
  || fail "Info.plist does not use the API-origin build setting"

if rg -q 'local-demo|LocalDemoSyncTransport' "$mac_root/GoalflowMac" --glob '*.swift'; then
  fail "production macOS source contains a silent demo synchronization fallback"
fi

if rg -q '/Users/' "$mac_root/GoalflowMacTests" --glob '*.swift'; then
  fail "macOS tests depend on a developer-machine absolute path"
fi

rg -q 'goalflow://auth/callback' "$mac_root/GoalflowMac/Sync/SyncTransport.swift" \
  || fail "the exact PKCE callback contract is missing"
rg -q 'code_challenge_method.*s256' "$mac_root/GoalflowMac/Services/SupabaseAuthService.swift" \
  || fail "the PKCE S256 contract is missing"

echo "macOS public configuration gate PASS"
