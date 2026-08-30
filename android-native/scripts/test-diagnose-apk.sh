#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname "$0")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
tool_dir="$work_dir/tools"
mkdir -p "$tool_dir" "$work_dir/apk"

printf '%s\n' 'manifest test payload' > "$work_dir/apk/AndroidManifest.xml"
(
    cd "$work_dir/apk"
    zip -q "$work_dir/test.apk" AndroidManifest.xml
)

cat > "$tool_dir/zipalign" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$tool_dir/apksigner" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$tool_dir/aapt2" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == "dump" && "$2" == "badging" ]]; then
    printf '%s\n' "package: name='com.example.goalflow' versionCode='7' versionName='1.2'" "targetSdkVersion:'35'"
    if [[ "$AAPT2_INCLUDE_SDK" == "1" ]]; then
        printf '%s\n' "sdkVersion:'26'"
    fi
    exit 0
fi

if [[ "$1" == "dump" && "$2" == "xmltree" ]]; then
    [[ "$3" == "$EXPECTED_APK" ]]
    [[ "$4" == "--file" ]]
    [[ "$5" == "AndroidManifest.xml" ]]
    printf '%s\n' "$*" > "$CALL_LOG"
    printf '%s\n' '    A: android:minSdkVersion(0x0101020c)=(type 0x10)0x1a'
    exit 0
fi

exit 2
STUB
chmod +x "$tool_dir"/*

primary_output="$(
    PATH="$tool_dir:$PATH" \
    EXPECTED_APK="$work_dir/test.apk" \
    CALL_LOG="$work_dir/aapt2-call" \
    AAPT2_INCLUDE_SDK=0 \
    AAPT2_INCLUDE_SDK=1 \
    GOALFLOW_APK_LABEL=TEST-ONLY \
    "$script_dir/diagnose-apk.sh" "$work_dir/test.apk"
)"
grep -Fqx 'MIN_SDK=26' <<<"$primary_output"
[[ ! -e "$work_dir/aapt2-call" ]]

output="$(
    PATH="$tool_dir:$PATH" \
    EXPECTED_APK="$work_dir/test.apk" \
    CALL_LOG="$work_dir/aapt2-call" \
    GOALFLOW_APK_LABEL=TEST-ONLY \
    "$script_dir/diagnose-apk.sh" "$work_dir/test.apk"
)"

grep -Fqx 'APK_DIAGNOSTIC_LABEL=TEST-ONLY' <<<"$output"
grep -Fqx 'PACKAGE=com.example.goalflow' <<<"$output"
grep -Fqx 'VERSION_CODE=7' <<<"$output"
grep -Fqx 'VERSION_NAME=1.2' <<<"$output"
grep -Fqx 'MIN_SDK=26' <<<"$output"
grep -Fqx 'TARGET_SDK=35' <<<"$output"
grep -Fq -- "xmltree $work_dir/test.apk --file AndroidManifest.xml" "$work_dir/aapt2-call"
grep -Fqx 'APK_DIAGNOSTIC=PASS' <<<"$output"

printf '%s\n' "$output"
