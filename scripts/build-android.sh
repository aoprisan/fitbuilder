#!/usr/bin/env bash
# Local Android build: web build → cap sync → Gradle. Output lands in build-output/.
#
#   scripts/build-android.sh debug     # installable debug APK (default)
#   scripts/build-android.sh release   # Play Store AAB + release APK
#
# Release signing comes from the environment (never commit a keystore):
#   ANDROID_KEYSTORE           path to the .jks / .keystore file
#   ANDROID_KEYSTORE_PASSWORD  store password
#   ANDROID_KEY_ALIAS          key alias
#   ANDROID_KEY_PASSWORD       key password (defaults to the store password)
# …or put the same values in android/keystore.properties (see the .example).
# Without either the release artifacts are built unsigned.
set -euo pipefail

MODE="${1:-debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/build-output"

die() { echo "error: $*" >&2; exit 1; }

case "$MODE" in debug | release) ;; *) die "usage: $0 [debug|release]" ;; esac

# ── Prerequisites ────────────────────────────────────────────────────────────
command -v java >/dev/null || die "Java not found. Install JDK 21 (Android Studio bundles one: set JAVA_HOME to its jbr/)."
JAVA_MAJOR="$(java -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -n1)"
[[ -n "$JAVA_MAJOR" && "$JAVA_MAJOR" -ge 21 ]] || die "JDK 21+ required (found: ${JAVA_MAJOR:-unknown})."

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK" && -f "$ROOT/android/local.properties" ]]; then
  SDK="$(sed -nE 's/^sdk\.dir=(.*)$/\1/p' "$ROOT/android/local.properties")"
fi
if [[ -z "$SDK" ]]; then
  for guess in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [[ -d "$guess" ]] && SDK="$guess" && break
  done
fi
[[ -n "$SDK" && -d "$SDK" ]] || die "Android SDK not found. Install it via Android Studio, or set ANDROID_HOME."
# Gradle reads the SDK path from local.properties (git-ignored).
[[ -f "$ROOT/android/local.properties" ]] || echo "sdk.dir=$SDK" > "$ROOT/android/local.properties"

# ── Web build + sync into the native project ─────────────────────────────────
cd "$ROOT"
[[ -d node_modules ]] || npm ci
npm run build
npx cap sync android

# ── Gradle ───────────────────────────────────────────────────────────────────
mkdir -p "$OUT"
cd "$ROOT/android"
chmod +x gradlew

if [[ "$MODE" == "debug" ]]; then
  ./gradlew assembleDebug
  cp app/build/outputs/apk/debug/app-debug.apk "$OUT/gym-log-debug.apk"
  echo
  echo "✔ $OUT/gym-log-debug.apk"
  echo "  install on a connected device: adb install -r \"$OUT/gym-log-debug.apk\""
  exit 0
fi

# Signing is configured in android/app/build.gradle from android/keystore.properties
# or the ANDROID_KEY* env vars above; this only checks for it up front.
if [[ -f "$ROOT/android/keystore.properties" ]]; then
  echo "Signing with android/keystore.properties"
elif [[ -n "${ANDROID_KEYSTORE:-}" ]]; then
  [[ -f "$ANDROID_KEYSTORE" ]] || die "ANDROID_KEYSTORE not found: $ANDROID_KEYSTORE"
  : "${ANDROID_KEYSTORE_PASSWORD:?set ANDROID_KEYSTORE_PASSWORD}"
  : "${ANDROID_KEY_ALIAS:?set ANDROID_KEY_ALIAS}"
  # Gradle resolves relative paths against android/, so hand it an absolute one.
  ANDROID_KEYSTORE="$(cd "$(dirname "$ANDROID_KEYSTORE")" && pwd)/$(basename "$ANDROID_KEYSTORE")"
  export ANDROID_KEYSTORE
else
  echo "warning: no android/keystore.properties or ANDROID_KEYSTORE — release artifacts will be UNSIGNED (Play won't accept them)." >&2
fi

VERSION="$(node -p "require('$ROOT/package.json').version")"
echo "Building release $VERSION (versionCode from package.json unless ANDROID_VERSION_CODE is set)"
./gradlew bundleRelease assembleRelease
cp app/build/outputs/bundle/release/app-release.aab "$OUT/gym-log-release.aab"
APK="$(ls app/build/outputs/apk/release/app-release*.apk | head -n1)"
cp "$APK" "$OUT/gym-log-release.apk"
echo
echo "✔ $OUT/gym-log-release.aab   (upload to Google Play)"
echo "✔ $OUT/gym-log-release.apk   (side-load)"
