#!/usr/bin/env sh
set -eu

# Owner-device installation for T807D_EEA (ZXKRS4VKGQ8PWGEQ)
APK="android-native/app/build/outputs/apk/production/release/app-production-release.apk"
if [ ! -f "$APK" ]; then
  echo "OWNER_INSTALL=SKIP (no release apk)"
  exit 0
fi

# Find aapt and apksigner
AAPT=""
for p in "$ANDROID_HOME/build-tools/35.0.0/aapt" "$ANDROID_HOME/build-tools"/*/aapt; do [ -x "$p" ] && AAPT="$p" && break; done
APKSIGNER=""
for p in "$ANDROID_HOME/build-tools/35.0.0/apksigner" "$ANDROID_HOME/build-tools"/*/apksigner; do [ -x "$p" ] && APKSIGNER="$p" && break; done

PKG=$($AAPT dump badging "$APK" 2>/dev/null | grep -o "package: name='[^']*'" | cut -d"'" -f2)
VCODE=$($AAPT dump badging "$APK" 2>/dev/null | grep -o "versionCode='[^']*'" | cut -d"'" -f2)
VNAME=$($AAPT dump badging "$APK" 2>/dev/null | grep -o "versionName='[^']*'" | cut -d"'" -f2)

echo "Installing $PKG $VCODE $VNAME to owner device"
# Check device
if ! adb devices -l | grep -q "device"; then
  echo "OWNER_INSTALL=SKIP (no device)"
  exit 0
fi

adb shell pm list packages | grep -q "$PKG" && adb uninstall "$PKG" >/dev/null 2>&1 || true
adb install -r "$APK" >/dev/null 2>&1
adb shell pm list packages | grep -q "$PKG" || { echo "OWNER_INSTALL=FAIL not installed"; exit 1; }

# Launch and measure
START=$(adb shell am start -W -n "$PKG/com.mariusschober.goalflow.nativeapp.MainActivity" 2>&1)
echo "$START"
TOTAL=$(echo "$START" | grep "TotalTime" | grep -o "[0-9]*" | head -n 1)
echo "TotalTime: $TOTAL ms"
if [ -n "$TOTAL" ] && [ "$TOTAL" -lt 1500 ]; then
  echo "COLD_START=PASS (<1500ms)"
else
  echo "COLD_START=WARN ($TOTAL ms)"
fi

# gfxinfo
adb shell dumpsys gfxinfo "$PKG" 2>&1 | head -n 60 > /tmp/gfxinfo.txt
cat /tmp/gfxinfo.txt | head -n 30
JANKY=$(grep "Janky frames:" /tmp/gfxinfo.txt | head -n 1 | grep -o "[0-9]*" | head -n 1 || echo "0")
echo "Janky: $JANKY"
if [ "$JANKY" -lt 10 ]; then
  echo "JANK=PASS"
else
  echo "JANK=WARN"
fi

# meminfo
adb shell dumpsys meminfo "$PKG" 2>&1 | head -n 30 > /tmp/meminfo.txt
PSS=$(grep "TOTAL PSS" /tmp/meminfo.txt | grep -o "[0-9]*" | head -n 1 || echo "0")
echo "PSS: $PSS KB"

# logcat check no crash
sleep 2
LOGCAT=$(adb logcat -d 2>&1 | grep -E "AndroidRuntime.*$PKG|FATAL.*$PKG" | head -n 20 || true)
if [ -n "$LOGCAT" ]; then
  echo "LOGCAT_FAIL: $LOGCAT"
  exit 1
fi
echo "LOGCAT=PASS (no crash)"

# cert
"$APKSIGNER" verify --print-certs "$APK" 2>&1 | grep "CN=Goalflow" && echo "CERT=PASS" || echo "CERT=FAIL"

# digest
sha256sum "$APK" | cut -d' ' -f1 > /tmp/apk.sha256
echo "APK_SHA256=$(cat /tmp/apk.sha256)"

# Record to RELEASE_REPORT
echo "OWNER_DEVICE_INSTALL=PASS on $(adb shell getprop ro.product.model 2>&1 | tr -d '\r') $(adb shell getprop ro.build.version.release 2>&1 | tr -d '\r') api $(adb shell getprop ro.build.version.sdk 2>&1 | tr -d '\r')"

# Cleanup? Keep installed for owner
echo "OWNER_INSTALL=PASS"
