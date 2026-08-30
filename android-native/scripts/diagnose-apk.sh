#!/usr/bin/env bash
set -euo pipefail

apk_path="${1:?usage: diagnose-apk.sh path/to/app.apk}"
if [[ ! -f "$apk_path" || "$apk_path" != *.apk ]]; then
    echo "Expected an existing .apk file: $apk_path" >&2
    exit 2
fi

echo "APK_DIAGNOSTIC_LABEL=${GOALFLOW_APK_LABEL:-TEST-ONLY}"
echo "APK_PATH=$apk_path"
echo "APK_SHA256=$(sha256sum "$apk_path" | awk '{print $1}')"
echo "APK_BYTES=$(stat -c '%s' "$apk_path")"

unzip -t "$apk_path" >/dev/null
echo "ZIP_TEST=PASS"

sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
find_tool() {
    local name="$1"
    if command -v "$name" >/dev/null 2>&1; then
        command -v "$name"
        return 0
    fi
    if [[ -n "$sdk_root" && -d "$sdk_root" ]]; then
        find "$sdk_root/build-tools" -type f -name "$name" -perm -u+x 2>/dev/null \
            | sort -V | tail -n 1
    fi
}

zipalign_bin="$(find_tool zipalign || true)"
apksigner_bin="$(find_tool apksigner || true)"
aapt2_bin="$(find_tool aapt2 || true)"
aapt_bin="$(find_tool aapt || true)"

if [[ -z "$zipalign_bin" ]]; then
    echo "zipalign was not found; APK structural verification is incomplete." >&2
    exit 3
fi
if ! "$zipalign_bin" -c -P 16 4 "$apk_path" >/dev/null 2>&1; then
    "$zipalign_bin" -c 4 "$apk_path" >/dev/null
fi
echo "ZIPALIGN=PASS"

if [[ -z "$apksigner_bin" ]]; then
    echo "apksigner was not found; APK signature verification is incomplete." >&2
    exit 3
fi
"$apksigner_bin" verify --verbose --print-certs "$apk_path"
echo "APK_SIGNATURE=PASS"

if [[ -n "$aapt2_bin" ]]; then
    badging="$("$aapt2_bin" dump badging "$apk_path")"
elif [[ -n "$aapt_bin" ]]; then
    badging="$("$aapt_bin" dump badging "$apk_path")"
else
    echo "aapt/aapt2 was not found; manifest metadata verification is incomplete." >&2
    exit 3
fi

package_name="$(printf '%s\n' "$badging" | sed -n "s/^package: name='\\([^']*\\)'.*/\\1/p" | head -n 1)"
version_code="$(printf '%s\n' "$badging" | sed -n "s/^package:.*versionCode='\\([^']*\\)'.*/\\1/p" | head -n 1)"
version_name="$(printf '%s\n' "$badging" | sed -n "s/^package:.*versionName='\\([^']*\\)'.*/\\1/p" | head -n 1)"
min_sdk="$(printf '%s\n' "$badging" | awk -F"\047" '$1 ~ /^[[:space:]]*sdkVersion/ { print $2; exit }')"
if [[ -z "$min_sdk" && -n "$aapt2_bin" ]]; then
    manifest_dump="$("$aapt2_bin" dump xmltree "$apk_path" AndroidManifest.xml)"
    min_sdk_hex="$(printf '%s\n' "$manifest_dump" | sed -n 's/.*android:minSdkVersion[^=]*=0x\([0-9a-fA-F]*\).*/\1/p' | head -n 1)"
    if [[ -n "$min_sdk_hex" ]]; then
        min_sdk="$(printf '%d' "0x${min_sdk_hex}")"
    fi
fi
target_sdk="$(printf '%s\n' "$badging" | sed -n "s/^targetSdkVersion:'\\([^']*\\)'.*/\\1/p" | head -n 1)"
printf 'PACKAGE=%s\nVERSION_CODE=%s\nVERSION_NAME=%s\nMIN_SDK=%s\nTARGET_SDK=%s\n' \
    "$package_name" "$version_code" "$version_name" "$min_sdk" "$target_sdk"
[[ -n "$package_name" && -n "$version_code" && -n "$min_sdk" ]] || {
    echo "Manifest metadata is incomplete." >&2
    exit 4
}

if [[ "${DIAGNOSE_APK_INSTALL:-0}" == "1" ]]; then
    adb_bin="$(command -v adb || true)"
    [[ -n "$adb_bin" ]] || { echo "adb was not found for install verification." >&2; exit 3; }
    "$adb_bin" wait-for-device
    if [[ -n "${DIAGNOSE_APK_UPGRADE_FROM:-}" ]]; then
        "$adb_bin" uninstall "$package_name" >/dev/null 2>&1 || true
        "$adb_bin" install "${DIAGNOSE_APK_UPGRADE_FROM}"
        "$adb_bin" install -r "$apk_path"
        echo "INSTALL_MATRIX=UPGRADE_PASS"
    else
        "$adb_bin" uninstall "$package_name" >/dev/null 2>&1 || true
        "$adb_bin" install "$apk_path"
        echo "INSTALL_MATRIX=CLEAN_INSTALL_PASS"
    fi
    "$adb_bin" shell monkey -p "$package_name" 1 >/dev/null
    sleep 3
    "$adb_bin" shell dumpsys activity activities | grep -q "$package_name"
    echo "LAUNCH_FIRST_FRAME=PASS"
fi

echo "APK_DIAGNOSTIC=PASS"
