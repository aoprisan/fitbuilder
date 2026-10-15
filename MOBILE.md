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

## iOS

The `ios/` Xcode project is committed and uses Swift Package Manager (Capacitor 8's
default), so **no CocoaPods** is needed. On a Mac with Xcode:

```bash
npm run ios               # build + sync + open ios/App/App.xcodeproj in Xcode
```

Pick your team under *Signing & Capabilities* once, then run on a device or archive
for TestFlight / the App Store.

## Rest timer & notifications

Timers (set stopwatch, rest clock, session HUD) are anchored to wall-clock time and the
in-flight set is persisted (`liveProgress.ts`), so they read correctly after the phone
is locked, the app is backgrounded, or the WebView is reloaded.

The **rest alert** is what needs the OS: a JS timer is suspended on a locked phone. In
the native app `src/notify.ts` schedules a local notification
([`@capacitor/local-notifications`](https://capacitorjs.com/docs/apis/local-notifications))
for the instant the rest target is crossed. The OS delivers it with sound/vibration on the
lock screen, and it's cancelled as soon as the next set starts or the screen is left.
In a browser the old in-page beep/vibration/Web Notification cue is used instead.

- **Permissions** are asked the first time a rest-alert target (1:00, 1:30, …) is
  tapped: the notification prompt on iOS / Android 13+, then, once, Android 12+'s
  *Alarms & reminders* screen (exact alarms, so the alert isn't delayed). Declining exact
  alarms still works; the alert is just scheduled inexact.
- **Android** posts to a high-importance `rest-timer` channel (heads-up, lock screen)
  with the monochrome status icon `res/drawable/ic_stat_timer.xml`. The plugin's
  manifest merges `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `WAKE_LOCK` and
  `RECEIVE_BOOT_COMPLETED`.
- **iOS** shows the banner even while the app is open (`presentationOptions` in
  `capacitor.config.ts`). No extra entitlements or background modes are needed.

## Building locally

Mobile builds are done on your own machine (no CI job, so they cost no GitHub Actions
minutes):

- **Android debug APK:** see *Build a debug APK from the CLI* above.
- **iOS simulator build** (macOS), the same check Xcode's Run does:

  ```bash
  npm run build && npx cap sync ios
  cd ios/App && xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
  ```

Release builds (signed AAB/IPA) are produced locally: Android Studio →
*Build › Generate Signed Bundle*, Xcode → *Product › Archive*.

The `android/` and `ios/` native projects are committed to the repo per
Capacitor's recommendation; build artifacts inside them are git-ignored.
