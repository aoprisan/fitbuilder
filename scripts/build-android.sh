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
# Without them the release artifacts are built unsigned.
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

SIGN_ARGS=()
if [[ -n "${ANDROID_KEYSTORE:-}" ]]; then
  [[ -f "$ANDROID_KEYSTORE" ]] || die "ANDROID_KEYSTORE not found: $ANDROID_KEYSTORE"
  : "${ANDROID_KEYSTORE_PASSWORD:?set ANDROID_KEYSTORE_PASSWORD}"
  : "${ANDROID_KEY_ALIAS:?set ANDROID_KEY_ALIAS}"
  SIGN_ARGS=(
    "-Pandroid.injected.signing.store.file=$(cd "$(dirname "$ANDROID_KEYSTORE")" && pwd)/$(basename "$ANDROID_KEYSTORE")"
    "-Pandroid.injected.signing.store.password=$ANDROID_KEYSTORE_PASSWORD"
    "-Pandroid.injected.signing.key.alias=$ANDROID_KEY_ALIAS"
    "-Pandroid.injected.signing.key.password=${ANDROID_KEY_PASSWORD:-$ANDROID_KEYSTORE_PASSWORD}"
  )
else
  echo "warning: ANDROID_KEYSTORE not set — release artifacts will be UNSIGNED (Play won't accept them)." >&2
fi

# `${arr[@]+...}` keeps an empty array safe under `set -u` on macOS bash 3.2.
./gradlew bundleRelease assembleRelease ${SIGN_ARGS[@]+"${SIGN_ARGS[@]}"}
cp app/build/outputs/bundle/release/app-release.aab "$OUT/gym-log-release.aab"
APK="$(ls app/build/outputs/apk/release/app-release*.apk | head -n1)"
cp "$APK" "$OUT/gym-log-release.apk"
echo
echo "✔ $OUT/gym-log-release.aab   (upload to Google Play)"
echo "✔ $OUT/gym-log-release.apk   (side-load)"
