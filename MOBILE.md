# Mobile builds (Capacitor)

The web app is wrapped as a native iOS/Android app with [Capacitor](https://capacitorjs.com).
The native projects load the production Vite build (`dist/`) from `webDir` — there is
no separate mobile codebase.

## Config

`capacitor.config.ts` — `appId: com.fitbuilder.app`, `appName: Gym Log`, `webDir: dist`.

## Prerequisites

- **Android:** JDK 17+ and the Android SDK (Android Studio). The Gradle build reads the
  SDK path from `android/local.properties` (auto-generated, git-ignored).
- **iOS** (macOS only): Xcode + CocoaPods (`sudo gem install cocoapods`).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run build:mobile` | Build the web app, then `cap sync` (copy assets + update native deps) |
| `npm run cap:sync` | Copy `dist/` into the native projects and update plugins |
| `npm run cap:copy` | Copy `dist/` only (no dependency update — faster) |
| `npm run cap:add:android` | Scaffold the `android/` native project (already done) |
| `npm run cap:add:ios` | Scaffold the `ios/` native project |
| `npm run android` | Build + sync + open the project in Android Studio |
| `npm run android:run` | Build + run on a connected device / emulator |
| `npm run ios` | Build + sync + open the project in Xcode |
| `npm run ios:run` | Build + run on a simulator / device |

## Typical loop

```bash
npm run build:mobile      # after any web change
npm run android           # opens Android Studio to run / archive
```

## Build a debug APK from the CLI

```bash
npm run build && npm run cap:sync
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

## Adding iOS

iOS is wired up (`@capacitor/ios` is installed) but not yet scaffolded, since it needs
Xcode + CocoaPods. On a Mac with those installed:

```bash
npm run build
npm run cap:add:ios
npm run ios
```

The `android/` (and future `ios/`) native projects are committed to the repo per
Capacitor's recommendation; build artifacts inside them are git-ignored.
