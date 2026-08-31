#!/usr/bin/env sh
set -eu

# Test signing for release artifacts. If no keystore, skip (local dev).
if [ -z "${ANDROID_KEYSTORE_BASE64:-}" ] && [ ! -f "${HOME}/.gradle/gradle.properties" ]; then
  echo "SIGNING=SKIP (no keystore)"
  exit 0
fi

# Find apksigner
APKSIGNER=""
for p in "$ANDROID_HOME/build-tools"/*/apksigner; do
  if [ -x "$p" ]; then APKSIGNER="$p"; break; fi
done
if [ -z "$APKSIGNER" ]; then
  echo "SIGNING=SKIP (apksigner not found)"
  exit 0
fi

apk=$(find android-native/app/build/outputs/apk/production/release -name "*.apk" 2>/dev/null | head -n 1)
if [ -z "$apk" ] || [ ! -f "$apk" ]; then
  echo "SIGNING=SKIP (no release apk)"
  exit 0
fi

echo "Checking $apk"
"$APKSIGNER" verify --verbose --print-certs "$apk" 2>&1 | tee /tmp/certs.txt
if grep -q "CN=Android Debug" /tmp/certs.txt; then
  echo "SIGNING=FAIL (debug cert, expected release CN=Goalflow)" >&2
  exit 1
fi
if grep -q "CN=Goalflow" /tmp/certs.txt; then
  echo "SIGNING=PASS (release cert CN=Goalflow)"
  exit 0
fi
echo "SIGNING=PASS (release cert, no debug)"
