# Gym Log — Training Ledger

A fast, **offline-first, no-account** workout app with a vintage "training
ledger" look. Two sides in one app:

- **Trainers** author shareable, branded routine sheets and hand them to clients
  as a PNG/PDF, a QR code, or a one-tap share link — no login required for the
  student.
- **Lifters** log sessions set-by-set with a rotary dial, rest timer, and
  proximity-to-failure tracking, then see stats, weekly volume, and per-muscle
  recovery — and can draft a starting plan with an AI assistant.

Everything runs in the browser (or as an installable app). Your data stays on
your device.

**▶ Try it: https://aoprisan.github.io/fitbuilder/** — install it from your
browser's "Add to Home Screen" for an app-like, offline experience.

## Highlights

- **Two modes, one app** — a Trainer surface (authoring + sharing) and a Student
  surface (logging + analytics), switched from the header.
- **Offline-first PWA** — installable, works with no connection; pure
  `localStorage`, no backend, no sign-up.
- **Share without a server** — export routines and session recaps as PNG/PDF,
  generate a printable QR code, or send a self-contained share link.
- **Live logging** — stopwatch, rest timer, rotary kg/reps dial, RIR (reps in
  reserve) chips, and resume-after-reload.
- **Analytics that matter** — progress charts per exercise, weekly sets per
  muscle, and a recovery board with a systemic-fatigue gauge.
- **Build a plan with Claude** — a copy/paste handoff (not an API): it drafts a
  prompt, you paste the reply back, and it imports as a routine.
- **Import** existing routines from `.xlsx` / `.xls` spreadsheets and text PDFs.

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
unless configured**, sends no personal or training data, strips share-link
contents, and honours Do-Not-Track. To enable it, set the build-time variables
documented in [`.env.example`](./.env.example):

```bash
VITE_PLAUSIBLE_DOMAIN=your-domain.example   # enables analytics
# VITE_PLAUSIBLE_ENDPOINT=...               # only for a self-hosted instance
```

Leave them unset (the default) and the app never makes a tracking request.

## License

Proprietary. © 2026 Andrei Oprisan. All rights reserved. See [`LICENSE`](./LICENSE).
