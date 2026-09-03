#!/usr/bin/env bash
set -euo pipefail

# Compatibility wrapper for manual checks. When signing material is configured,
# absence of an APK or verifier is a failure rather than a skip.
expect_signed="${ANDROID_EXPECT_SIGNED:-0}"
if [[ -n "${ANDROID_KEYSTORE_BASE64:-}" || -n "${ANDROID_KEYSTORE_PASSWORD:-}" \
  || -n "${ANDROID_KEY_ALIAS:-}" || -n "${ANDROID_KEY_PASSWORD:-}" ]]; then
  expect_signed=1
fi

ANDROID_EXPECT_SIGNED="$expect_signed" \
  exec bash "$(dirname "$0")/verify-signing-strict.sh" "${1:-}"
