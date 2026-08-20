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

A client-side, offline-first PWA for one person logging their own training. No backend, no UI framework — plain TypeScript + DOM APIs, bundled by Vite, deployed to GitHub Pages (`.github/workflows/deploy.yml` on push to `main`), and wrapped as native iOS/Android via Capacitor 8.

**Readiness-first design (2026 redesign, `docs/ui-redesign.md`):** the app opens on a body-fatigue map, one tap starts a session, and everything else (history, per-exercise stats, Claude analysis) hangs off the logged sessions. The old trainer/routine-authoring domain (routine sheet builder, Execute runner, XLSX/PDF import, sheet exports/share links, Claude plan/routine builders, student/trainer mode) was deleted in that redesign; `RoutineSheet` *types* survive in `types.ts` because logged exercises still carry `target`/`prescription` from historic routine runs, and old `gymlog.sheets*` localStorage keys are left in place (unread) so nothing a user stored is destroyed.

### Boot & navigation
- Entry: `index.html` → `src/main.ts`. `boot()` builds a fixed header (brand + settings gear + tab row) and a single `<main id="view" class="view-host">` host.
- **Navigation is the `Nav` interface** (`src/router.ts`): `go(view)` over `ViewName = "body" | "live" | "history" | "exercise"`. Views are `mount*(host, nav)` functions (in `src/views/`) that may return a `Cleanup`; `main.ts` runs the previous view's cleanup, clears the host, and mounts the next — views are remounted from scratch each time. Browser/Android back is supported by stamping each navigation into `history.state` and restoring on `popstate`.
- **Three tabs**: Body (`body`, the launch screen), Train (`live`), History (`history`). `exercise` (per-movement detail) is a pushed screen reached from History's exercise chips and highlights the History tab; it's seeded via `seedExercise(key)` from `views/exercise.ts` before `nav.go("exercise")` (null seed = searchable index of all logged movements).

### The screens
| View | File | What it shows |
|------|------|---------------|
| **Body** (home) | `views/body.ts` | Readiness header (`systemicRecovery` + `overallStatus`, muscles still on the clock), the Start/Resume session CTA, the rotatable 3D body map coloured by Fatigue/Strength/Hypertrophy/Efficiency (`bodyMap.ts` scores, `body3d.ts` figure, `views/bodySvg.ts` WebGL fallback), a last-session card, and PNG/PDF/share export. |
| **Train** | `views/live.ts` | The live logger — a state machine (`Stage` = list/select/exercise, `SetSub` = idle/running/logging/resting) with stopwatch, rest timer + alert, rotary kg/reps dial (`views/dial.ts`), RIR chips, warm-up ramp, plate calculator, PR flash, superset jumps, and per-exercise plan benchmark (`benchmark.ts`) for sessions that carried a routine prescription. |
| **History** | `views/history.ts` | Session cards (resume/repeat/delete, expandable effort summary, per-session export/analyze) plus the **Analyze with Claude** scope chips (this session / last 3 / 5 / 10 / all) and JSON/XML archive export. |
| **Exercise** | `views/exercise.ts` | Per-movement detail: estimated 1RM headline (best Epley set + user-tested 1RM editor via `oneRmStore.ts`), e1RM trend chart (`views/chart.ts`), reps-you-can-expect at trained loads (`repCapacity`), and past sets grouped by session. |

### Data model
One domain: **`TrainingSession`** (logged exercises → `WorkSet`s of reps/kg/duration/RIR, tagged by `MuscleGroup`), schema in `types.ts`, storage in `logStorage.ts` (`gymlog.sessions`), validation in `logValidate.ts` (corrupt entries silently dropped on load; imports strictly validated). `SessionArchive` is the JSON/XML export bundle.

- **Exercise catalog** (`movements.ts`): a `Movement` is a named exercise with a primary muscle, secondary muscles (compound credit at `SECONDARY_MUSCLE_SHARE`), and a load type. Generic-gear movements use id `"${muscle}::${equipment}"` to stay compatible with pre-catalog stats keys (`exerciseKey` in `stats.ts`).
- **Resume** (`liveProgress.ts`, key `gymlog.liveProgress`): snapshots the in-flight live flow (which session, stage/sub, pending set values, running timers) so a reload / phone-lock resumes mid-set. Body's CTA and History's Resume respect it (`loadProgress`/`clearProgress`).
- **Derived analytics over logged history:** `effort.ts` (effort points, hydration/protein/calorie heuristics, RIR-weighted `stimulusProximity`/`fatigueProximity`), `recovery.ts` (per-muscle recovery clocks from `RECOVERY_HOURS` + demand scaling, plus the systemic gauge), `stats.ts` (progress series, `epley1RM`/`bestOneRm`/`repCapacity`, weekly volume landmarks), `records.ts` (PR detection), `overload.ts` + `warmup.ts` (progression nudges and ramp), `bodyMap.ts` (the four per-muscle map metrics). Each is UI-free and consumed by the views.
- `src/state.ts` holds the one in-memory `AppState`: `activeLog` (the open live session). Everything else is read from storage at mount time.
- Other localStorage keys: `gymlog.oneRm` (user-tested maxes), `gymlog.bodyweight` (set in Settings; feeds protein/calorie estimates), rest-alert and theme/language prefs. `backup.ts` bundles/restores every raw `gymlog.*` entry — it's schema-agnostic on purpose.

### Claude handoff (no API, no backend)
"Analyze with Claude" is a **share/copy flow, not an API call** — there is no Anthropic SDK, API key, or server. Do not wire one up. `exporters.ts` `analyzeSession(s)InClaude` / `copySession(s)Prompt` share (or copy + open claude.ai) a Markdown report built by `util.ts` `sessionsToMarkdown`. Entry points: History's scope chips and each session card.

### Export / render pipeline
Dependency-free PNG/PDF/share output in the "Training Ledger" visual language. `canvasKit.ts` holds the shared Canvas 2D palette/fonts/primitives; `sessionRender.ts` (session recap) and `bodyMapRender.ts` (front/back/side map) draw to canvas; `pdf.ts` wraps a JPEG into a minimal PDF; `logo.ts` + `trainer.ts` carry the brand banner. `exporters.ts` turns canvases into PNG/PDF downloads or Web Share files and emits JSON/XML/Markdown session archives.

### Shared building blocks
`src/dom.ts` (`h()` element builder, `append()`, `clear()`, `qs()`), `src/util.ts` (uuid, formatters, serializers), `src/i18n.ts` (EN/RO — every view registers its own strings via `registerTranslations` at module load and reads `t()` at mount time), `src/theme.ts` (4 themes as CSS custom-property sets), `src/styles.css` (the entire "vintage letterpress / Training Ledger" design system — tokens, hard block-print shadows, print styles). Reusable view widgets: `views/dial.ts`, `views/chart.ts`, `views/sessionSummary.ts` (effort/hydration/protein panel shared by Train, History and exports), `views/filter.ts`, `views/snackbar.ts` (undo), `views/lookback.ts`.

## Gotchas

- **The Claude features are not an API integration** — they share/copy a prompt (see "Claude handoff" above). Don't add an API key or SDK.
- **Naming is inconsistent and that's expected:** the repo dir is `fitbuilder`, the package is `gym-log-exercise-builder`, the UI brand is "GYM LOG". Match whatever the surrounding code/file uses; don't "unify" them.
- Much UI text is bilingual **English/Romanian** — new user-facing strings need a Romanian translation registered next to them. Sample legacy fixtures in the repo root (`RUTINE FLUX 2026.xlsx`, `rutine.pdf`) are leftovers from the deleted import pipeline; they're harmless.
- `vite.config.ts` uses `base: "./"` (relative paths, for GitHub Pages / any sub-path) and defines `__BUILD_TIME__`.
- Three.js is lazy-loaded only by the body map (`body3d.ts`); keep it out of the initial chunk.
