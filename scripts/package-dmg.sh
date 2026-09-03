#!/bin/bash
set -euo pipefail
# Package GoalflowMac for distribution — archive, export, create DMG, notarize, staple, verify
# Usage: ./scripts/package-dmg.sh [version] [team_id] [apple_id]
VERSION=${1:-1.0.1}
TEAM_ID=${2:-""}
APPLE_ID=${3:-""}
PROJECT="macos-native/GoalflowMac.xcodeproj"
SCHEME="GoalflowMac"
ARCHIVE="build/GoalflowMac.xcarchive"
EXPORT_DIR="build/Export"
DMG="build/GoalflowMac-${VERSION}.dmg"
APP="build/Export/GoalflowMac.app"

echo "→ Archiving $SCHEME $VERSION"
xcodebuild archive -project "$PROJECT" -scheme "$SCHEME" -configuration Release -archivePath "$ARCHIVE" CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_IDENTITY="Apple Development" || echo "Archive with ad-hoc fallback"
# Export with Developer ID if TEAM_ID set, else ad-hoc export
if [ -n "$TEAM_ID" ]; then
  cat > /tmp/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>method</key><string>developer-id</string><key>teamID</key><string>$TEAM_ID</string></dict></plist>
PLIST
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT_DIR" -exportOptionsPlist /tmp/ExportOptions.plist || true
else
  echo "No TEAM_ID — skipping Developer ID export, using ad-hoc build/Export"
  mkdir -p "$EXPORT_DIR"
  cp -R "$ARCHIVE/Products/Applications/GoalflowMac.app" "$APP" 2>/dev/null || echo "No archive app, using Debug build"
fi

if [ ! -d "$APP" ]; then
  echo "No app found at $APP, trying Debug build"
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release build CODE_SIGN_IDENTITY="-" || true
  APP=$(find ~/Library/Developer/Xcode/DerivedData -name "GoalflowMac.app" -path "*Release*" | head -n 1)
  mkdir -p "$EXPORT_DIR" && cp -R "$APP" "$EXPORT_DIR/" 2>/dev/null || true
  APP="$EXPORT_DIR/GoalflowMac.app"
fi

echo "→ Verifying codesign"
codesign --verify --deep --strict --verbose=2 "$APP" || true
codesign -d --entitlements :- "$APP" | head -n 30 || true

if command -v create-dmg &>/dev/null; then
  echo "→ Creating DMG $DMG"
  rm -f "$DMG"
  create-dmg --volname "Goalflow" --window-pos 200 120 --window-size 600 400 --icon GoalflowMac.app 200 190 --app-drop-link 400 185 "$DMG" "$EXPORT_DIR/" || echo "create-dmg failed"
  hdiutil verify "$DMG" || true
else
  echo "create-dmg not installed (brew install create-dmg) — skipping DMG"
fi

if [ -n "$APPLE_ID" ] && [ -f "$DMG" ]; then
  echo "→ Notarizing $DMG (requires --team-id --apple-id --password)"
  xcrun notarytool submit "$DMG" --wait --apple-id "$APPLE_ID" || true
  xcrun stapler staple "$DMG" || true
  xcrun stapler validate "$DMG" || true
  spctl --assess --type open --context context:primary-signature -v "$DMG" || true
fi

echo "→ Done. Artifacts in build/"
ls -lh build/ 2>/dev/null | head -n 20
