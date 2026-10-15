#!/usr/bin/env bash
# Local iOS build (macOS + Xcode): web build → cap sync → xcodebuild.
# Output lands in build-output/.
#
#   scripts/build-ios.sh sim       # unsigned simulator build (default) — no Apple account needed
#   scripts/build-ios.sh archive   # signed .xcarchive + exported .ipa
#
# Archive settings come from the environment:
#   IOS_TEAM_ID        your 10-character Apple Developer Team ID (required)
#   IOS_EXPORT_METHOD  development (default) | app-store-connect | release-testing
set -euo pipefail

MODE="${1:-sim}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/build-output"
PROJECT="$ROOT/ios/App/App.xcodeproj"

die() { echo "error: $*" >&2; exit 1; }

case "$MODE" in sim | archive) ;; *) die "usage: $0 [sim|archive]" ;; esac

# ── Prerequisites ────────────────────────────────────────────────────────────
[[ "$(uname -s)" == "Darwin" ]] || die "iOS builds need macOS with Xcode."
command -v xcodebuild >/dev/null || die "xcodebuild not found. Install Xcode, then: sudo xcode-select -s /Applications/Xcode.app"

# ── Web build + sync into the native project ─────────────────────────────────
cd "$ROOT"
[[ -d node_modules ]] || npm ci
npm run build
npx cap sync ios
mkdir -p "$OUT"

if [[ "$MODE" == "sim" ]]; then
  xcodebuild \
    -project "$PROJECT" \
    -scheme App \
    -configuration Debug \
    -sdk iphonesimulator \
    -destination "generic/platform=iOS Simulator" \
    -derivedDataPath "$OUT/ios-derived" \
    CODE_SIGNING_ALLOWED=NO \
    build
  APP="$OUT/ios-derived/Build/Products/Debug-iphonesimulator/App.app"
  echo
  echo "✔ $APP"
  echo "  run it: open -a Simulator && xcrun simctl install booted \"$APP\" && xcrun simctl launch booted com.fitbuilder.app"
  exit 0
fi

: "${IOS_TEAM_ID:?set IOS_TEAM_ID to your Apple Developer Team ID}"
METHOD="${IOS_EXPORT_METHOD:-development}"
ARCHIVE="$OUT/GymLog.xcarchive"

xcodebuild \
  -project "$PROJECT" \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  archive

EXPORT_PLIST="$OUT/ExportOptions.plist"
cat > "$EXPORT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>$METHOD</string>
  <key>teamID</key><string>$IOS_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -exportPath "$OUT/ios-export" \
  -allowProvisioningUpdates
cp "$OUT"/ios-export/*.ipa "$OUT/gym-log.ipa"
echo
echo "✔ $ARCHIVE"
echo "✔ $OUT/gym-log.ipa   ($METHOD)"
