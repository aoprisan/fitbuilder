# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # tsc --noEmit (typecheck) then vite build -> dist/
npm run typecheck  # tsc --noEmit only
npm run preview    # serve the production build locally
```

- **No test runner and no linter/formatter are configured.** The only correctness gate is `npm run typecheck` (or `npm run build`, which runs it first). Run it after changes.
- **Mobile (Capacitor):** `npm run build:mobile` (build + `cap sync`), then `npm run android` / `npm run ios`. See `MOBILE.md`. The `android/` native project is committed; `dist/` is copied into it by `cap sync`.
- **TypeScript is strict**, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, `isolatedModules`, and `verbatimModuleSyntax`. Use `import type { ... }` for type-only imports, and expect array/index access to be `T | undefined`.

## Architecture

A client-side, offline-first PWA. No backend, no UI framework — plain TypeScript + DOM APIs, bundled by Vite, deployed to GitHub Pages (`.github/workflows/deploy.yml` on push to `main`), and wrapped as native iOS/Android via Capacitor 8.

### Boot & navigation
- Entry: `index.html` → `src/main.ts`. `boot()` builds a fixed header (brand + nav row) and a single `<main id="view" class="view-host">` host.
- **No URL router and no browser history.** Navigation is the `Nav` interface (`src/router.ts`): `go(view)`, `editSheet(sheet)`, `runSheet(sheet)`, `startLive(sheet)`. Views call these to switch screens and hand off data.
- Each view is a `mount*(host, nav)` function (in `src/views/`) that may return a `Cleanup`. On navigation, `main.ts` runs the previous view's cleanup, clears the host, and mounts the next — views are remounted from scratch each time, never kept in the DOM.
- `ViewName` has 7 values but the nav bar shows only 4 tabs (`home`, `live`, `sheet` = "Routines", `execute`). `stats`, `recovery`, and `claudeStart` are reachable only via `nav.go(...)` from inside other views. The Execute tab runs the *current working sheet* as a snapshot (`nav.runSheet(cloneSheet(state.editingSheet))`).

### Two data domains (the key mental model)
There are two independent workout representations. They map onto the product split (see the `product-model` memory): **Routines** are a trainer authoring shareable documents for students; **Live** is the owner logging their own training. The two are loosely coupled and hand off explicitly.

| Domain | Data type | UI views | Logic | Storage | Validate |
|--------|-----------|----------|-------|---------|----------|
| **Routine sheet** (shareable, free-text) | `RoutineSheet` (routines → exercises with free-text prescriptions like "30-50 repetari") | `views/sheet.ts` (build, "Routines" tab) · `views/execute.ts` (run, "Execute" tab) | `sheet.ts` (defaults), `execute.ts` (runner: `flattenSheet`, `parseTargetReps` heuristics) | `sheetStorage.ts` | `sheetValidate.ts` |
| **Training session** (live log/journal) | `TrainingSession` (logged exercises → `WorkSet`s of reps/kg/duration, tagged by `MuscleGroup`) | `views/live.ts` (log set-by-set, "Live" tab) | `log.ts` | `logStorage.ts` | `logValidate.ts` |

All three schemas live in `types.ts` (each carries a `schema` id + `version`): `RoutineSheet`, `TrainingSession`, and `SessionArchive` (the export bundle).

**Handoffs between the domains:** `sheetToSession()` (`log.ts`) starts a Live session pre-loaded from a routine (`nav.startLive`); `sessionToSheet()` (`util.ts`) turns a finished session back into a shareable sheet; `repeatSession()` clones a past session's exercises into a fresh one.

### Live-session subsystem (everything that feeds off `TrainingSession`)
`views/live.ts` is the largest view — a small state machine (`Stage` = list/select/exercise, `SetSub` = idle/running/logging/resting) with stopwatch, rest timer, and a rotary kg/reps dial.
- **Exercise catalog** (`movements.ts`): a `Movement` is a named exercise with a primary muscle, secondary muscles (compound credit at `SECONDARY_MUSCLE_SHARE`), and a load type. Picking one sets a `LoggedExercise`'s `exerciseId`, `equipment`, and secondary muscles. Generic-gear movements use id `"${muscle}::${equipment}"` to stay compatible with pre-catalog stats keys.
- **Resume** (`liveProgress.ts`, key `gymlog.liveProgress`): snapshots the in-flight flow (which session, stage/sub, pending set values, running timers) so a reload / phone-lock / navigate-away resumes mid-set. `main.ts`/`home.ts` detect a resumable session from this snapshot.
- **Derived analytics over logged history:** `effort.ts` (effort-point + hydration/calorie/protein heuristics, calibrated against the median of past sessions), `recovery.ts` (per-muscle recovery readiness from `RECOVERY_HOURS`), `oneRmStore.ts` (key `gymlog.oneRm`, user-set 1RMs), `stats.ts` (progress series per exercise key). Each has a `views/*` and/or `*Render.ts` counterpart.

### State & persistence
- `src/state.ts` holds one in-memory `AppState`: `editingSheet` (the working copy open in the Routines builder), `executing` (sheet chosen for Execute), `activeLog` (the open Live session). It seeds the default push/pull sheets on first run and opens the most-recently-updated sheet as a fresh working copy. It also brokers a one-shot `SheetFlash` status message for the sheet view.
- Persistence is **localStorage only**. Keys: `gymlog.sheets` / `gymlog.sessions` (the two domains), plus `gymlog.liveProgress`, `gymlog.oneRm`, `gymlog.trainer`, `gymlog.logo`, and `gymlog.sheets.seeded`. `sheetStorage.ts` / `logStorage.ts` each expose `load*`/`save*`/`delete*`/`seed*Once`.
- **Edits operate on clones** (`cloneSheet` in `util.ts`) so stored copies aren't mutated; views call `save*()` to persist.
- Validation: corrupt localStorage entries are silently dropped on load; JSON/file imports are strictly validated (schema id + version) with missing IDs regenerated for safe round-tripping.

### Claude handoff (no API, no backend)
"Build a plan with Claude" and "Analyze in Claude" are **copy/share/paste flows, not API calls** — there is no Anthropic SDK, API key, or server. Do not wire one up.
- `claudePlan.ts` + `views/claudeStart.ts`: `buildPlanPrompt()` composes a text prompt (with a schema-accurate example `RoutineSheet`), handed off via the OS share sheet or clipboard + opening `claude.ai/new` (`startPlanInClaude`/`copyPlanPrompt` in `exporters.ts`). The user pastes Claude's reply back; `parsePlanFromText()` extracts the JSON and forces the schema markers before validating into a `RoutineSheet`.
- `exporters.ts` `analyzeSession(s)InClaude` / `copySession(s)Prompt`: share/copy a Markdown report of logged sessions for an agent to analyze.

### Import pipeline (`src/import/`)
`importRoutineFile(file)` (`import/index.ts`) dispatches by extension/MIME and **lazy-imports** the matching parser so the heavy libraries stay out of the initial bundle:
- `.xlsx/.xls/.xlsm/.xlsb` → `import/xlsx.ts` (SheetJS).
- `.pdf` → `import/pdf.ts` (`pdfjs-dist`, worker via Vite asset URL); `import/pdfGrid.ts` clusters text runs into rows.
- Both produce a grid handed to `import/grid.ts`'s `gridToRoutines()`, which classifies rows as headers/exercises and assembles `RoutineSheet[]`.

### Export / render pipeline
Dependency-free PNG/PDF/share output, all in the "Training Ledger" visual language. `canvasKit.ts` holds the shared Canvas 2D palette/fonts/primitives; `sheetRender.ts`, `sessionRender.ts`, `statsRender.ts`, `recoveryRender.ts` each draw one artifact to a canvas; `pdf.ts` wraps a JPEG into a minimal PDF; `logo.ts` loads the brand banner. `exporters.ts` is the entry point — turns those canvases into PNG/PDF downloads or Web Share files, and also emits JSON/XML/Markdown session archives.

### Shared building blocks
`src/dom.ts` (`h()` element builder, `append()`, `clear()`, `qs()`), `src/util.ts` (uuid, `cloneSheet`, formatters, session↔sheet conversions, Markdown/JSON/XML serializers), `src/styles.css` (the entire "vintage letterpress / Training Ledger" design system — CSS custom-property tokens, hard block-print shadows, print styles). Reusable view widgets live under `views/`: `dial.ts` (rotary kg/reps input), `chart.ts` (progress line chart), `lookback.ts` (history slider).

## Gotchas

- **Never `npm i xlsx`.** `package.json` pins `xlsx` to the patched CDN tarball (`https://cdn.sheetjs.com/...tgz`); the npm registry build is not used. SheetJS is lazy-imported only on spreadsheet upload.
- **The Claude features are not an API integration** — they share/copy a prompt and parse a pasted reply (see "Claude handoff" above). Don't add an API key or SDK.
- **Naming is inconsistent and that's expected:** the repo dir is `fitbuilder`, the package is `gym-log-exercise-builder`, the UI brand is "GYM LOG", and the Claude prompt text calls the app "FitBuilder". Match whatever the surrounding code/file uses; don't "unify" them.
- Sample import fixtures live in the repo root: `RUTINE FLUX 2026.xlsx`, `rutine.pdf`, `sample.jpeg`. Bundled default routines and much UI/sample text are in **Romanian** (e.g. "RUTINA IMPINS", "30-50 repetari") — intentional, not a typo to "fix".
- `vite.config.ts` uses `base: "./"` (relative paths, for GitHub Pages / any sub-path) and defines `__BUILD_TIME__`.
