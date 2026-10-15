# Google Play release

Everything needed to ship the Android app (`com.fitbuilder.app`) to Google Play:
what's automated, what you do once by hand, and what to answer in the Play Console.
Builds stay local (see `MOBILE.md`, no CI job).

## What's in the repo

| Path | What it is |
| --- | --- |
| `android/app/build.gradle` | `versionName` = `package.json` version; `versionCode` = `MAJOR*10000 + MINOR*100 + PATCH` (1.0.0 → 10000). Release signing from `android/keystore.properties` or env vars. |
| `android/keystore.properties.example` | Template for the git-ignored signing config. |
| `scripts/build-android.sh release` | Web build → `cap sync` → signed `build-output/gym-log-release.aab`. |
| `fastlane/metadata/android/{en-US,ro}/` | Store listing: `title.txt` (≤30), `short_description.txt` (≤80), `full_description.txt` (≤4000), `changelogs/<versionCode>.txt` (≤500), `images/` (icon, feature graphic, phone screenshots). |
| `scripts/play-assets.mjs` | Regenerates every image in `images/` from the real app with seeded demo data. |
| `fastlane/Fastfile`, `Appfile`, `Gemfile` | Upload lanes (`fastlane supply`). |
| `public/privacy.html` | Privacy policy, served by GitHub Pages; this is the URL Play asks for. |

npm wrappers:

```bash
npm run build:android:release   # signed AAB → build-output/
npm run play:assets             # regenerate icon / feature graphic / screenshots
npm run play:validate           # dry-run the upload against Play
npm run play:internal           # build + upload to the internal track (+ listing)
npm run play:metadata           # push listing text/graphics only
npm run play:promote -- to:production rollout:0.2   # see "Promote" below
```

## One-time setup

1. **Developer account:** sign up at <https://play.google.com/console> ($25 once,
   identity verification). Personal accounts created after Nov 2023 must run a
   **closed test with at least 12 opted-in testers for 14 consecutive days** before
   production access unlocks. Plan for it: start the closed test as soon as the
   first build is up.
2. **Upload key:** create it and keep a backup of the file and its passwords
   (a password manager plus an offline copy):
   ```bash
   keytool -genkeypair -v -keystore ~/keys/gymlog-upload.jks -alias upload \
     -keyalg RSA -keysize 2048 -validity 10000
   cp android/keystore.properties.example android/keystore.properties   # then edit
   ```
   Keep **Play App Signing** on when the console offers it (the default): Google
   holds the app-signing key, and your key above is only the *upload* key, which
   Google can reset if it's lost.
3. **Create the app** in the console: name *Gym Log · Training Ledger*, default
   language English (United States), *App*, *Free*.
4. **First upload by hand:** Google requires the first AAB to go through the
   console. Run `npm run build:android:release`, then upload
   `build-output/gym-log-release.aab` under *Testing → Internal testing → Create
   release*.
5. **API access for fastlane** (optional, for every later release):
   - Google Cloud console: create a project, enable the *Google Play Android
     Developer API*, create a service account and download its JSON key.
   - Play Console → *Users and permissions → Invite new users*: invite the service
     account's e-mail and give it *Release* permissions for this app.
   - Save the key as `play-service-account.json` in the repo root (git-ignored), or
     point `PLAY_JSON_KEY` at it.
   - Install fastlane: `bundle install` (Ruby 3.x). Then `npm run play:validate`.

## Each release

1. Bump the version: `npm version patch` (or `minor` / `major`). This creates a
   git commit and tag, and the versionCode follows automatically (1.0.1 → 10001).
2. Write the notes in `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`
   and `…/ro/changelogs/<versionCode>.txt`.
3. If the UI changed noticeably, run `npm run play:assets` and check the images.
4. `npm run play:internal`: builds, signs and uploads to the internal track
   together with the listing and notes. Install it from the Play internal-testing
   link and check it on a real phone (see *Smoke test* below).
5. **Promote:** `npm run play:promote -- from:internal to:production rollout:0.2`
   for a 20 % staged rollout (omit `rollout` for 100 %). For the closed test, use
   `to:alpha` (the API's name for the default closed track). Then raise the
   rollout in the console, or re-run the lane with a higher `rollout`.

Re-uploading the same version (for example, a build rejected in review): set
`ANDROID_VERSION_CODE=10002` (any higher number) for that one build. Play never
accepts a versionCode twice.

## Play Console: app content answers

*Policy → App content.* The answers below match what the app actually does
(checked against the code: no SDKs, no backend, analytics disabled in the native
app because it runs on `localhost`).

| Section | Answer |
| --- | --- |
| Privacy policy | `https://aoprisan.github.io/fitbuilder/privacy.html` |
| App access | All functionality is available without special access (no login). |
| Ads | No, the app does not contain ads. |
| Content rating (IARC questionnaire) | Category *All Other App Types*. Answer **No** to violence, sexuality, language, controlled substances, gambling, user interaction/communication, sharing location, and digital purchases. Expected result: Everyone / PEGI 3. |
| Target audience | 18 and over (simplest; avoids the Families policy). 13+ is also fine for a fitness log. |
| News app | No. |
| Data safety | **No data collected, no data shared.** All training data stays on the device; the app has no backend and no analytics in the Android build. Exports and shares only happen when the user starts them, through the system share sheet, which Play doesn't count as collection. See the network note below. |
| Health apps declaration | Health & fitness → activity/fitness tracking. No medical claims, no connection to Health Connect. |
| Government app / financial features | No / none. |
| Advertising ID | No (the app doesn't use it). |

**Exact alarms:** the rest alert uses `SCHEDULE_EXACT_ALARM`, which the user grants
in system settings (the app opens that screen once). Only `USE_EXACT_ALARM` needs
Play's exact-alarm declaration, and the app doesn't request it. If the console
asks anyway, the use case is a user-set rest timer.

**Network:** the app makes no network requests of its own. Its typefaces are
bundled (`src/fonts.ts`, from `@fontsource/*`), analytics is off in the native
build, and the only online step is opening Claude when the user taps Analyze.
That is why Data safety can honestly answer "no data collected".

## Store listing

*Grow → Store presence → Main store listing.* The text and images in
`fastlane/metadata/android/` are what `play:metadata` / `play:internal` upload. To
enter them by hand instead, paste from the same files.

- **App category:** Health & Fitness. **Tags:** workout tracker, gym log, strength
  training.
- **Contact e-mail:** the one in the privacy policy. Website: the GitHub Pages URL.
- **Graphics:** `images/icon.png` (512×512, full-bleed; Play adds the rounded
  mask), `images/featureGraphic.jpg` (1024×500), `images/phoneScreenshots/*.jpg`
  (5 × 1080×1920, captioned; JPEG because Play rejects alpha channels). Play accepts 2 to 8 phone screenshots. Tablet
  screenshots are optional; the app is portrait phone-first.
- **Romanian (ro):** a full translated listing ships alongside en-US. Add the
  language under *Manage translations* if you enter it by hand.

## Smoke test before promoting

On a real phone, from the Play-installed build:

- First launch, offline: the app opens on Body and logs a session with no network.
- Rest alert: set 1:00 in Train, lock the phone during rest, and check that the
  notification arrives on time. Grant/deny the *Alarms & reminders* prompt once each.
- Android back button navigates between tabs and doesn't exit mid-session.
- Settings scrolls end to end; backup → restore round-trips.
- PNG/PDF export and Share open the system sheet.
