# Gym Log — Training Ledger

A fast, **offline-first, no-account** strength-training log with a vintage
"training ledger" look. It opens on a map of your body showing what's fatigued
and what's recovered; one tap starts a session, and everything else (history,
per-exercise stats, an analysis by Claude) hangs off the sessions you log.

Everything runs in the browser, as an installable PWA, or as a native
Android / iOS app. Your data stays on your device.

**▶ Try it: https://aoprisan.github.io/fitbuilder/** — install it from your
browser's "Add to Home Screen" for an app-like, offline experience.

## Highlights

- **Readiness body map** — a rotatable 3D figure coloured per muscle by
  fatigue, strength, hypertrophy or efficiency, with a systemic readiness gauge
  and recovery clocks for every muscle still recovering.
- **Live logging** — a ring picker for the exercise, a stopwatch per set, a
  rotary kg / reps dial with one-tap picks (plan, last set, last time,
  progression), RIR (reps in reserve) chips, warm-up ramp, plate calculator,
  PR flash, rest timer with a lock-screen alert, and resume after a reload.
- **Templates** — save any logged session as a named template ("Push A") from
  History and start it from the Train tab in one tap. The working sets you
  saved become the plan, so each set is benchmarked against it.
- **History & stats** — session cards (resume, repeat, save as template,
  export), and per-exercise detail with an estimated 1RM, its trend, and the
  reps you can expect at the loads you train.
- **Analyze with Claude** — a share / copy handoff (not an API call): it builds
  a Markdown report of one session or the last N and hands it to Claude, or to
  any AI as a copied prompt.
- **Exports & backup** — PNG / PDF session recaps and body maps, JSON / XML
  archives, and a one-file backup / restore of everything on the device
  (Settings).
- **Reminders** — optional "fully recovered" and "time to train" notifications
  that a paired watch can mirror.
- **English / Romanian**, four themes, and a short first-run guide.

## Run locally

```bash
npm install
npm run dev        # Vite dev server with HMR
npm run build      # typecheck (tsc --noEmit) then production build → dist/
npm run typecheck  # typecheck only
npm run preview    # serve the production build
```

There is no test runner or linter; **`npm run typecheck` (run by `npm run
build`) is the correctness gate.**

## Mobile (iOS / Android)

The app is wrapped natively with Capacitor. See [`MOBILE.md`](./MOBILE.md) for
the full setup; in short: `npm run build:mobile`, then `npm run android` /
`npm run ios`.

## Deployment

Pushes to `main` auto-deploy the web build to GitHub Pages via
`.github/workflows/deploy.yml`.

## Privacy & analytics

Gym Log collects no personal data and stores your training data only on your
device — see the [Privacy Policy](./public/privacy.html) and
[Terms of Use](./public/terms.html).

Hosted builds can optionally enable **privacy-friendly, cookieless** analytics
(Plausible-compatible) to measure anonymous, aggregate usage. It is **disabled
unless configured**, sends no personal or training data, drops the URL's
query and hash, and honours Do-Not-Track. To enable it, set the build-time variables
documented in [`.env.example`](./.env.example):

```bash
VITE_PLAUSIBLE_DOMAIN=your-domain.example   # enables analytics
# VITE_PLAUSIBLE_ENDPOINT=...               # only for a self-hosted instance
```

Leave them unset (the default) and the app never makes a tracking request.

## License

Proprietary. © 2026 Andrei Oprisan. All rights reserved. See [`LICENSE`](./LICENSE).
