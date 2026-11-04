# Mobile builds (Capacitor)

The web app is wrapped as a native iOS/Android app with [Capacitor](https://capacitorjs.com).
The native projects load the production Vite build (`dist/`) from `webDir` — there is
no separate mobile codebase.

## Config

`capacitor.config.ts` — `appId: io.galagogen.fitbuilder`, `appName: Gym Log`, `webDir: dist`.

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
| `npm run cap:add:ios` | Scaffold the `ios/` native project (already done) |
| `npm run android` | Build + sync + open the project in Android Studio |
| `npm run android:run` | Build + run on a connected device / emulator |
| `npm run ios` | Build + sync + open the project in Xcode |
| `npm run ios:run` | Build + run on a simulator / device |
| `npm run build:android` / `build:android:release` | CLI build → debug APK / signed AAB + APK (see below) |
| `npm run build:ios` / `build:ios:archive` | CLI build → simulator app / signed archive + IPA (see below) |

## Typical loop

```bash
npm run build:mobile      # after any web change
npm run android           # opens Android Studio to run / archive
```

## Build from the CLI

`scripts/build-android.sh` and `scripts/build-ios.sh` do the whole chain (web build →
`cap sync` → Gradle / xcodebuild), check prerequisites first, and copy the results into
`build-output/` (git-ignored):

| Script | Needs | Produces |
| --- | --- | --- |
| `npm run build:android` | JDK 21+, Android SDK | `build-output/gym-log-debug.apk` |
| `npm run build:android:release` | + signing env vars (below) | `gym-log-release.aab` (Play) + `gym-log-release.apk` |
| `npm run build:ios` | macOS + Xcode | unsigned simulator `App.app` (no Apple account needed) |
| `npm run build:ios:archive` | + `IOS_TEAM_ID` | `GymLog.xcarchive` + `gym-log.ipa` |

The Android SDK is found from `ANDROID_HOME` / `ANDROID_SDK_ROOT`, `android/local.properties`,
or Android Studio's default install path (`~/Library/Android/sdk`, `~/Android/Sdk`).

**Publishing to Google Play** (versioning, store listing, screenshots, fastlane
upload, Play Console answers) is covered in [`docs/play-release.md`](docs/play-release.md).

**Android release signing** is read from `android/keystore.properties` (copy
`keystore.properties.example`, git-ignored) or the environment. Never commit the keystore:

```bash
export ANDROID_KEYSTORE=~/keys/gymlog.jks
export ANDROID_KEYSTORE_PASSWORD=…
export ANDROID_KEY_ALIAS=gymlog
export ANDROID_KEY_PASSWORD=…        # optional, defaults to the store password
npm run build:android:release
```

Without them the release build still runs but is unsigned. Create a keystore once with
`keytool -genkeypair -v -keystore gymlog.jks -alias gymlog -keyalg RSA -keysize 2048 -validity 10000`.

**iOS archive** signs automatically with your team (`IOS_TEAM_ID=ABCDE12345`), and
`IOS_EXPORT_METHOD` picks the IPA flavour: `development` (default, for your own
devices), `app-store-connect` (TestFlight / App Store), or `release-testing` (ad hoc).

Install the debug APK on a phone with `adb install -r build-output/gym-log-debug.apk`.
The simulator script prints the `simctl` commands to launch its build.

## iOS

The `ios/` Xcode project is committed and uses Swift Package Manager (Capacitor 8's
default), so **no CocoaPods** is needed. On a Mac with Xcode:

```bash
npm run ios               # build + sync + open ios/App/App.xcodeproj in Xcode
```

Pick your team under *Signing & Capabilities* once, then run on a device or archive
for TestFlight / the App Store.

### Share extension (Fuel's Claude replies)

The project has a second target, **ShareExtension** (`ios/App/ShareExtension/`,
bundle id `io.galagogen.fitbuilder.ShareExtension`), embedded in the app. It puts
*Gym Log* in the share sheet for text: sharing Claude's reply to a Fuel meal estimate
or menu plan opens the app on Fuel with the reply read in. The extension forwards the
text over the app's `gymlog-share://fuel?text=…` URL scheme (`App/Info.plist`), and
`AppDelegate.openSharedText` reloads the web view with `?text=…` — the same entry point
the PWA share target and the Android `ACTION_SEND` intent use. No App Group is needed.

- **Signing:** pick your team for *both* targets in Xcode the first time;
  `build:ios:archive` signs both automatically (`-allowProvisioningUpdates`).
- **Versions:** the extension carries its own `MARKETING_VERSION` /
  `CURRENT_PROJECT_VERSION` build settings. Keep them equal to the App target's when
  you bump a release, or App Store Connect rejects the upload.
- If the app can't be reached, the extension leaves the reply on the clipboard so
  *Paste reply* in Fuel still works.

## Meal photos & sharing to Claude

Fuel's *Take photo* is a `capture` file input. On Android, Capacitor's WebView chrome
client opens the camera app (`ACTION_IMAGE_CAPTURE`, declared under `<queries>` in the
manifest so Android 11+ can resolve it; no `CAMERA` permission). On iOS it needs the
`NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` strings in `Info.plist`.
Android's WebView has no `navigator.share`, so *Send to Claude* uses
[`@capacitor/share`](https://capacitorjs.com/docs/apis/share): the photo is written to
the cache with `@capacitor/filesystem` and shared through the existing `FileProvider`.
The prompt is copied to the clipboard as well, because the Claude app keeps a shared
image but drops the text that comes with it. After pulling this change, run
`npm run build:mobile` so `cap sync` picks up the two plugins.

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

## No CI builds

Mobile builds run only on your own machine with the scripts above. There is no GitHub
Actions job for them, so they cost no Actions minutes.

Prefer a GUI? Android Studio → *Build › Generate Signed Bundle* and Xcode →
*Product › Archive* produce the same release artifacts.

The `android/` and `ios/` native projects are committed to the repo per
Capacitor's recommendation; build artifacts inside them are git-ignored.
