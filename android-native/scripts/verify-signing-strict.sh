#!/usr/bin/env sh
set -eu
# Strict signing verification — fails closed when ANDROID_EXPECT_SIGNED=1 but no release APK or SKIP
apk="${1:-}"
if [ -n "$apk" ] && [ ! -f "$apk" ]; then
  apk=$(find android-native/app/build/outputs/apk/production/release -name "*.apk" 2>/dev/null | head -n 1 || true)
fi
if [ -z "$apk" ] || [ ! -f "$apk" ]; then
  if [ "${ANDROID_EXPECT_SIGNED:-}" = "1" ]; then
    echo "SIGNING=FAIL (release context expects signed APK but none found)" >&2
    exit 1
  fi
  echo "SIGNING=SKIP (no release apk, non-release context)"
  exit 0
fi
# In release context, SKIP is not allowed — must actually verify
if [ "${ANDROID_EXPECT_SIGNED:-}" = "1" ]; then
  # Find apksigner
  APKSIGNER=""
  for p in "$ANDROID_HOME/build-tools"/*/apksigner; do
    if [ -x "$p" ]; then APKSIGNER="$p"; break; fi
  done
  if [ -z "$APKSIGNER" ]; then
    echo "SIGNING=FAIL (apksigner not found in release context)" >&2
    exit 1
  fi
  echo "Checking $apk for release signature"
  "$APKSIGNER" verify --verbose --print-certs "$apk" 2>&1 | tee /tmp/certs-strict.txt
  if grep -q "CN=Android Debug" /tmp/certs-strict.txt; then
    echo "SIGNING=FAIL (debug cert in release context)" >&2
    exit 1
  fi
  echo "SIGNING=PASS (strict release verification)"
  exit 0
else
  # Non-release: allow SKIP but still report
  APKSIGNER=""
  for p in "$ANDROID_HOME/build-tools"/*/apksigner; do
    if [ -x "$p" ]; then APKSIGNER="$p"; break; fi
  done
  if [ -z "$APKSIGNER" ]; then
    echo "SIGNING=SKIP (apksigner not found, non-release)"
    exit 0
  fi
  echo "Checking $apk (non-release)"
  "$APKSIGNER" verify --verbose --print-certs "$apk" 2>&1 | tee /tmp/certs.txt || true
  if grep -q "CN=Android Debug" /tmp/certs.txt; then
    echo "SIGNING=INFO (debug cert, expected for non-release)"
  else
    echo "SIGNING=PASS (release cert or non-debug)"
  fi
  exit 0
fi
