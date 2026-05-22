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
- Entry: `index.html` → `src/main.ts`. `boot()` builds a fixed header + bottom nav and a single `<main id="view">` host.
- **No URL router and no browser history.** Navigation is the `Nav` interface (`src/router.ts`): `go()`, `edit()`, `start()`, `editSheet()`, `runSheet()`. Views call these to switch screens and hand off data.
- Each view is a `mount*(host, nav)` function (in `src/views/`) that may return a `Cleanup`. On navigation, `main.ts` runs the previous view's cleanup, clears the host, and mounts the next — views are remounted from scratch each time, never kept in the DOM.
- The nav bar has 7 tabs; `stats` is an 8th view reachable only via `nav.go("stats")`. The Session/Execute tabs snapshot the *current working copy* (`clonePlan(state.editing)` / `cloneSheet(state.editingSheet)`) before running.

### Two data domains (the key mental model)
There are two independent workout representations, each with a logic module, a `views/` UI module, a storage module, and a validator:

| Domain | Data type | Build/edit | Run | Logic | Storage | Validate |
|--------|-----------|------------|-----|-------|---------|----------|
| Structured plan | `ExercisePlan` (exercises → sets of reps/weight) | `views/builder.ts` | `views/session.ts` | `session.ts` | `storage.ts` | `validate.ts` |
| Free-text sheet | `RoutineSheet` (routines → exercises with free-text prescriptions) | `views/sheet.ts` ("Routines" tab) | `views/execute.ts` | `execute.ts` | `sheetStorage.ts` | `sheetValidate.ts` |

Note the naming overlap: top-level `src/session.ts` / `src/execute.ts` are the **runner logic** (state machines, e.g. `execute.ts`'s `parseTargetReps()` heuristics for free-text prescriptions); `src/views/session.ts` / `src/views/execute.ts` are the **UI**. A third type, `TrainingSession`, is the logged-workout journal (`log.ts`, `logStorage.ts`, `logValidate.ts`, surfaced in `views/stats.ts`).

### State & persistence
- `src/state.ts` holds a single in-memory `AppState` (current working copies + selected snapshots). It seeds bundled default plans/sheets on first run and opens the most-recently-updated one as a working copy.
- Persistence is **localStorage only**, via `storage.ts` / `sheetStorage.ts` / `logStorage.ts` (keys `gymlog.plans`, `gymlog.sheets`, `gymlog.sessions`). Each exposes `load*`/`save*`/`delete*`/`seed*Once`.
- **Edits operate on clones** (`clonePlan`/`cloneSheet` in `util.ts`) so stored copies aren't mutated; views call `save*()` to persist.
- Validation: corrupt localStorage entries are silently dropped on load; JSON/file imports are strictly validated (schema id + version in `types.ts`) with missing IDs regenerated for safe round-tripping.

### Import pipeline (`src/import/`)
`importRoutineFile(file)` (`import/index.ts`) dispatches by extension/MIME and **lazy-imports** the matching parser so the heavy libraries stay out of the initial bundle:
- `.xlsx/.xls/.xlsm/.xlsb` → `import/xlsx.ts` (SheetJS).
- `.pdf` → `import/pdf.ts` (`pdfjs-dist`, worker via Vite asset URL); `import/pdfGrid.ts` clusters text runs into rows.
- Both produce a grid handed to `import/grid.ts`'s `gridToRoutines()`, which classifies rows as headers/exercises and assembles `RoutineSheet[]`.

### Shared building blocks
`src/dom.ts` (`h()` element builder, `clear()`, `qs()`), `src/util.ts` (uuid, clones, formatters), `src/styles.css` (the entire "vintage letterpress / Training Ledger" design system — CSS custom-property tokens, hard block-print shadows, print styles). Audio cues `audio.ts`; export/render `exporters.ts`, `sheetRender.ts`, `pdf.ts`.

## Gotchas

- **Never `npm i xlsx`.** `package.json` pins `xlsx` to the patched CDN tarball (`https://cdn.sheetjs.com/...tgz`); the npm registry build is not used. SheetJS is lazy-imported only on spreadsheet upload.
- Sample import fixtures live in the repo root: `RUTINE FLUX 2026.xlsx`, `rutine.pdf`, `sample.jpeg`. Bundled default routines and much UI/sample text are in **Romanian** (e.g. "RUTINA IMPINS", "30-50 repetari") — this is intentional, not a typo to "fix".
- `vite.config.ts` uses `base: "./"` (relative paths, for GitHub Pages / any sub-path) and defines `__BUILD_TIME__`.
