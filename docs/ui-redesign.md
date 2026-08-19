# UI Redesign — "Readiness-first" GYM LOG

**Status: design/plan only — no implementation yet.**

The app is redesigned from scratch around one person logging their own training.
Anything that doesn't serve the core scenario is dropped. The core scenario:

> Open the app → see body fatigue on a body map → start a session → pick an
> exercise → log sets (exactly like today) → analyze the current session or the
> last N in Claude. For any exercise, see past sets and the estimated max.

Everything below maps onto code that already exists — the redesign is a
re-shelling and a deletion pass, not new analytics.

---

## 1. Design principles

1. **The home screen answers "what state is my body in?"** — not "what can this
   app do?". Fatigue map first, actions second.
2. **One primary action per screen.** Every screen has exactly one fat,
   thumb-reachable CTA (`Start session`, `+ Set`, `Analyze`). Everything else is
   secondary.
3. **Built for the gym context**: sweaty hands, phone flat on a bench, 30-second
   glances between sets. Big targets, sticky timers, no deep menus mid-session.
4. **Log flow stays as-is.** The current live set mechanics (stopwatch → dial →
   RIR chips → rest timer, ghost of last time, PR flash) are the best part of
   the app and are kept verbatim — only the chrome around them changes.
5. **Delete, don't hide.** Trainer/routine authoring, Execute, imports and the
   plan-builder prompts are removed outright, not tucked behind a mode switch.

## 2. Feature audit — keep / fold / drop

### Kept (the product)

| Capability | Existing code (reused as-is) |
|---|---|
| Body fatigue map (3D + SVG fallback) | `bodyMap.ts`, `body3d.ts`, `views/body.ts`, `views/bodySvg.ts` |
| Per-muscle + systemic recovery model | `recovery.ts` (`muscleRecovery`, `systemicRecovery`, colour ramp) |
| Live set logging (stopwatch, dial, RIR, rest, ghost, PR flash, hold-time, cardio) | `views/live.ts` state machine, `views/dial.ts`, `liveProgress.ts` |
| Exercise catalog | `movements.ts` |
| Analyze in Claude (session / last N) | `exporters.ts` `analyzeSessionInClaude`, `analyzeSessionsInClaude`, `copySession(s)Prompt` |
| Estimated 1RM & rep capacity | `stats.ts` `epley1RM`, `bestOneRm`, `bestRawOneRm`, `repCapacity`, `estimatedRepsAt`, `loadsForExercise`, `buildProgress`; `oneRmStore.ts` |
| Effort/session summary (tier, muscle breakdown, hydration/protein/kcal) | `effort.ts` |
| Storage, backup, i18n, themes, PWA/Capacitor shell | `logStorage.ts`, `backup.ts`, `i18n.ts`, `theme.ts`, `pwa.ts` |

### Folded into other screens

- **Recovery view** → becomes the Home screen itself (body map, fatigue metric
  default) plus a per-muscle detail sheet on tap.
- **Stats mega-view** → replaced by a focused **Exercise detail** screen
  (past sets, e1RM, reps-at-weight) reached from History or the picker.
- **Weekly volume view** → the body map's existing *Hypertrophy* metric toggle
  covers the "did I train everything this week?" question; the dedicated screen
  goes away.
- **Session export (PNG/PDF/MD/JSON)** → kept, but demoted to the session
  summary's overflow menu.

### Dropped (with the code that leaves)

| Dropped feature | Dead code (≈ lines) |
|---|---|
| Trainer mode + mode switch | `mode.ts`, mode gating in `main.ts` |
| Routine sheet builder ("Routines" tab) | `views/sheet.ts` (~1 800), `sheet.ts`, `sheetValidate.ts`, `sheetStorage.ts` |
| Execute runner | `views/execute.ts` (~800), `execute.ts` |
| Train tab (routine library / run-from-routine) | `views/train.ts`, `views/savedRoutines.ts` |
| XLSX/PDF import pipeline | `src/import/*` (+ SheetJS & pdfjs deps) |
| Sheet render/export & share links | `sheetRender.ts`, `shareRoutine.ts`, sheet parts of `exporters.ts` |
| "Build a plan / routine with Claude" prompt builders | `claudePlan.ts`, `claudeRoutine.ts`, `views/claudeStart.ts`, `views/claudeRoutine.ts` |
| Session → sheet conversion, sheet → session handoffs | `sessionToSheet`/`sheetToSession` in `util.ts`/`log.ts` |

Notes:
- `TrainingSession` data and every `gymlog.sessions` / `gymlog.oneRm` /
  `gymlog.liveProgress` key are untouched — nothing the user logged is lost.
  Orphaned `gymlog.sheets*` keys are left in localStorage (harmless) rather
  than migrated.
- `types.ts` keeps `RoutineSheet` types only as long as `prescription`/`target`
  fields on old logs reference them; the sheet schema itself stops being
  written.
- Bundle win: SheetJS, pdfjs-dist and the import/export sheet code leave the
  lazy-load graph entirely.

## 3. Information architecture

Three bottom tabs + one floating flow. (Current `ViewName` shrinks from 12 to ~6.)

```
┌─────────────────────────────────────────────┐
│  BODY (home)     TRAIN          HISTORY     │
│  body map +      active         sessions +  │
│  readiness       session /      analyze +   │
│  + start CTA     empty state    exercises   │
└─────────────────────────────────────────────┘
   Pushed screens (no tab): Exercise picker,
   Exercise detail, Session summary, Settings sheet
```

- **Body** is the launch screen, always. It *is* the old Recovery + Body map.
- **Train** shows the active session if one exists (or the resume snapshot from
  `liveProgress.ts`), otherwise an empty state with `Start session`.
- **History** lists past sessions and owns the Claude analysis entry point;
  exercise names anywhere in it link to **Exercise detail**.
- Navigation stays the existing `Nav`/`mount*` mechanism with browser-history
  popstate — no URL router needed.

## 4. Screens

### 4.1 Body (home)

The current `views/body.ts` promoted to home, with a readiness header and a
single CTA. Fatigue is the default metric (already is); the
Strength/Hypertrophy/Efficiency toggles stay as secondary reads.

```
┌──────────────────────────────┐
│ GYM LOG              ⚙  ⟳   │
│                              │
│  READY TO TRAIN   ● 78%      │  ← systemicRecovery + overallStatus
│  Chest fresh · Legs ~14h     │  ← top 1-2 lines from muscleRecovery
│                              │
│  ┌────────────────────────┐  │
│  │      [3D body map]     │  │  ← drag to spin, tap muscle
│  │   coloured by fatigue  │  │
│  └────────────────────────┘  │
│  Fatigue ▾  Strength Hyper…  │  ← metric segmented toggle
│  fresh ▓▓▓▓▓▓▓▓▓ fatigued    │  ← gradient legend
│                              │
│  ┌ Last session ──────────┐  │
│  │ Push day · yesterday   │  │
│  │ 14 sets · Solid effort │  │
│  └────────────────────────┘  │
│                              │
│  [▶ START SESSION          ] │  ← single fat CTA, sticky above nav
│  Body    ○Train    History   │
└──────────────────────────────┘
```

- **Tap a muscle** → bottom sheet: recovery % and hours remaining
  (`MuscleRecovery`), last trained date, e1RM for that muscle
  (`strengthByMuscle` detail), and a "Train this" shortcut into the picker
  filtered to that muscle. This replaces the whole Recovery screen.
- **In-flight session** → the CTA becomes `▶ RESUME — Bench press, set 3`
  (from the `liveProgress` snapshot); a fresh start is offered behind it.
- Start-of-session fatigue self-report (1–5 chips, `startFatigue`) is asked in
  the same sheet as the start CTA tap — one modal, skippable.

**Pattern**: *status board + single primary action*. The screen is a read, not
a menu.

### 4.2 Exercise picker (pushed from Train)

Full-screen search-first picker, recovery-aware. Replaces the live view's
current muscle→movement two-step with one list; the catalog and ids
(`movements.ts`) are unchanged.

```
┌──────────────────────────────┐
│ ←  Add exercise    [search…] │
│                              │
│ RECENT                       │  ← sessionCountsByExercise, last-used first
│  Bench press      ● fresh    │
│  Lat pulldown     ● 6h left  │
│                              │
│ READY MUSCLES                │  ← muscleRecovery ordering: green groups first
│  Chest ●  Triceps ●  Core ●  │
│   › Incline DB press         │
│   › Cable fly                │
│ STILL RECOVERING             │
│  Legs (14h)  Biceps (20h)    │  ← collapsed by default, not hidden
└──────────────────────────────┘
```

- Every row carries a recovery dot in the muscle's `recoveryColor` — picking
  becomes a readiness decision without leaving the list.
- Long-press / detail chevron on a row → **Exercise detail** (see 4.4), so
  "what did I do last time?" is answerable *before* committing to the exercise.

**Patterns**: *search-first full-screen picker* (better than a bottom sheet for
a 100+ item catalog), *traffic-light affordance* carried over from the map.

### 4.3 Train — active session & set logger

The `views/live.ts` machine survives intact (list/select/exercise stages;
idle/running/logging/resting sub-states, dial, RIR chips, hold-time and cardio
variants, ghost row, benchmark rows, PR flash). Redesign is chrome only:

```
┌──────────────────────────────┐
│ Push day · 00:41:12    End ▸ │  ← sticky session HUD: elapsed, effort tier
│ ───────────────────────────  │
│ BENCH PRESS        chest ●   │
│ Last time: 60kg×8, 60×8, 55×8│  ← historyGhost anchor line
│                              │
│  ✓ 60 kg × 8   RIR 2   1:32  │
│  ✓ 60 kg × 8   RIR 1   1:41  │
│  ┌────────────────────────┐  │
│  │   [rotary dial]  60kg  │  │
│  │      reps: 8           │  │
│  └────────────────────────┘  │
│  RIR  [0][1][2][3][4+]       │
│  [＋ LOG SET               ] │
│ ───────────────────────────  │
│ ⏱ REST 1:12 / 2:00   [skip] │  ← persistent bottom bar while resting
└──────────────────────────────┘
```

- **Session HUD** (new): sticky top strip with elapsed time and the live
  effort tier (`readEffort`), always visible while scrolled.
- **Rest timer as a sticky bottom bar** instead of an inline stage — the
  next set's dial is already visible and prefilled behind it.
- Exercise list inside the session is a simple card stack; `+ Add exercise`
  opens the picker (4.2).
- **End session** → summary screen: effort tier, muscle breakdown
  (`muscleBreakdown`), hydration/protein/kcal, PRs hit, session duration —
  then two actions: `Analyze in Claude` (current session,
  `analyzeSessionInClaude`) and `Done`. Export formats live in `⋯`.

**Patterns**: *sticky HUD*, *ghost-row anchoring* ("beat last time" is the
implicit goal), *persistent timer bar*, *end-of-flow summary with one next
action*.

### 4.4 Exercise detail (pushed from picker or History)

The focused replacement for the Stats mega-view, one exercise at a time
(keyed by `ExerciseKey`).

```
┌──────────────────────────────┐
│ ←  Bench press       chest ● │
│                              │
│  EST. MAX        87.5 kg     │  ← bestOneRm (Epley), date + set it came from
│  best set 80kg × 5 · Aug 12  │     user-set 1RM (oneRmStore) shown if present
│  ▁▂▃▃▅▆▇  e1RM trend         │  ← buildProgress sparkline (views/chart.ts)
│                              │
│  REPS YOU CAN EXPECT         │  ← repCapacity / estimatedRepsAt
│  60kg → ~11 · 70kg → ~7      │     at the loads actually used (loadsForExercise)
│  80kg → ~4                   │
│                              │
│  PAST SETS                   │
│  Aug 17  60×8@2 60×8@1 55×8  │  ← sets grouped per session, RIR superscript
│  Aug 14  60×8 60×7 55×9      │     newest first, lazy "show more"
│  Aug 10  55×10 55×9 55×8     │
└──────────────────────────────┘
```

- "Estimated max rep" is the **e1RM headline**: calculated estimate
  (`bestOneRm`) side-by-side with the user-set 1RM when one exists, plus the
  raw best performed set (`bestRawOneRm`) so the estimate is auditable.
- Cardio keys swap the body for pace/distance trend (`buildCardioProgress`).
- Reached from: picker row chevron, any exercise name in History, and the
  logger's exercise header mid-session ("what's my max again?").

**Patterns**: *headline metric + evidence below it*, *sparkline over full
chart* (tap to expand), *append-only history list*.

### 4.5 History & Claude analysis

```
┌──────────────────────────────┐
│ HISTORY                      │
│                              │
│ ANALYZE WITH CLAUDE          │
│ [This session][3][5][10][All]│  ← scope chips
│ [🔍 Analyze ▸]               │  → analyzeSession(s)InClaude share/copy flow
│                              │
│ ┌ Aug 17 · Push day ───────┐ │
│ │ 14 sets · 52m · Solid    │ │  ← tap = session summary (same as end-of-
│ │ chest, triceps, delts    │ │     session screen, reopenable)
│ └──────────────────────────┘ │
│ ┌ Aug 14 · Pull day ───────┐ │
│ …                            │
└──────────────────────────────┘
```

- Scope chips + one button is the whole "analyze current or last X" feature;
  it reuses the existing share-sheet/clipboard flow and Markdown report
  builder unchanged. `This session` appears only while a session is open.
- Session card tap reopens the summary; from there per-session analyze/export.

**Pattern**: *segmented scope + single action*, card stack list.

### 4.6 Settings (sheet, not a screen)

Gear on Body opens the existing settings sheet: theme, language, backup
restore/download, app update, clear data. Unchanged.

## 5. Key flows

1. **Cold open** → Body: map painted from `muscleRecovery(loadSessions())`,
   CTA `Start session` → fatigue self-report chips → picker → logger.
   *(3 taps from launch to first set running.)*
2. **Mid-set resume** (reload/phone lock) → `liveProgress` snapshot detected →
   Body CTA reads `Resume`, Train tab badge; one tap back into the running
   set. Unchanged mechanics, new entry point.
3. **Between sets** → rest bar counts down, dial prefilled from ghost;
   `+ Log set` on the running stopwatch.
4. **Post-session** → End ▸ summary ▸ `Analyze in Claude` → share sheet to
   claude.ai, reply read there (no paste-back in the core loop anymore).
5. **"What's my bench max?"** → History (or picker) → Bench press →
   e1RM headline. Two taps.

## 6. Implementation outline (later, in order)

1. **Shell**: new 3-tab nav in `main.ts`, `ViewName` shrunk, Body as default
   view; fold readiness header + CTA into `views/body.ts`.
2. **Train**: re-chrome `views/live.ts` (HUD, sticky rest bar, picker
   extraction into `views/picker.ts`); keep the state machine and
   `liveProgress` snapshot format untouched.
3. **Exercise detail**: new `views/exercise.ts` assembled from existing
   `stats.ts` selectors + `views/chart.ts`.
4. **History**: new lean `views/history.ts` (session cards + analyze scopes),
   session summary extracted from live's `renderSessionSummary`.
5. **Deletion pass**: remove the dropped modules (§2), their styles, nav
   icons, i18n strings and deps; update `CLAUDE.md`. Typecheck
   (`npm run typecheck`) is the gate at every step.

Each phase leaves the app shippable; localStorage schemas never change.

## 7. Open decisions (recommendations, not blockers)

- **Trainer features**: recommend deleting rather than branching a "trainer
  edition"; git history preserves them if a separate app is ever wanted.
- **Weekly volume screen**: dropped here; if the weekly-sets read is missed,
  it returns as one card on Exercise detail / muscle sheet, not a screen.
- **Romanian i18n & Training-Ledger visual language**: both kept — this is an
  IA redesign, not a rebrand. All new screens use the existing card/token
  system in `styles.css`.
