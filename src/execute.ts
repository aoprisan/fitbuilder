import { findMovement, matchMovementByName, type Movement, movementsForMuscle } from "./movements";
import type { Equipment, ExerciseTarget, MuscleGroup, RoutineSheet, SetTarget, WorkSet } from "./types";
import { formatTarget } from "./util";

/** One runnable line in an execute run — a single exercise within a routine. */
export interface RunItem {
  /** Index of the parent routine within the sheet. */
  routineIndex: number;
  /** The parent routine's title, denormalized for display. */
  routineTitle: string;
  /** 0-based position of this exercise within its routine. */
  exerciseIndex: number;
  name: string;
  /** Human display label derived from the exercise's target (e.g. "3×10 @ 20kg", "50 reps") or its note. */
  prescription: string;
  /**
   * Total rep volume to fulfil — `totalReps` for a volume target, the summed reps
   * for a per-set target, or null for a note-only row (timed / hold / round-based,
   * completed by a manual "done" tap instead).
   */
  targetReps: number | null;
  /**
   * Per-set targets carried from a `kind: "sets"` exercise. When present the row
   * is driven set-by-set against these (reps + optional load), and `isDone` /
   * `fraction` count *sets* rather than total reps.
   */
  setTargets?: SetTarget[];
  /**
   * Catalog identity, preferring the RoutineExercise's carried fields, falling
   * back to a runtime `matchMovementByName(name)`. Absent only when the row
   * has no carried identity and no name match — those rows still need the user
   * to confirm muscle/gear at log time.
   */
  exerciseId?: string;
  muscle?: MuscleGroup;
  equipment?: Equipment;
  secondaryMuscles?: readonly MuscleGroup[];
}

/** Read a trailing "x N" multiplier (e.g. " x 5", " x3", " ×3"); defaults to 1. */
function trailingMultiplier(rest: string): number {
  const m = rest.match(/[x×]\s*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

/**
 * Best-effort parse of a free-text prescription into a total rep target.
 * Returns null when the work is timed or round-based (e.g. "20 secunde x 5",
 * "x 3 runde") and therefore carries no countable rep volume.
 *
 * Rules (first match wins), after stripping parenthetical tempo notes:
 *  - "5+5+5 x 5"  → sum of the plus-group × trailing multiplier        → 75
 *  - "3×10-12"    → sets × top-of-range                                → 36
 *  - "1-2-3-2-1"  → pyramid (3+ dash-separated numbers): sum × mult    → 9
 *  - "30-50 …"    → range (exactly 2 dash-separated numbers): the top  → 50
 *  - timed / round-only with no "repet…" keyword                       → null
 *  - "3×10" / "4 x 12" → sets × reps                                   → 30 / 48
 *  - "12, 10, 8"  → comma list of per-set reps: their sum             → 30
 *  - otherwise the first integer is the rep count ("70 repetari" → 70)
 */
export function parseTargetReps(prescription: string): number | null {
  const s = prescription.replace(/\([^)]*\)/g, " ").trim();
  if (s === "") return null;
  const lower = s.toLowerCase();
  const hasReps = lower.includes("repet"); // repetari / repetare

  // "5+5+5 x 5" — additive set blocks, optional ×rounds.
  const plus = s.match(/\d+(?:\s*\+\s*\d+)+/);
  if (plus) {
    const sum = plus[0].split("+").reduce((a, t) => a + Number(t.trim()), 0);
    return sum * trailingMultiplier(s.slice(plus.index! + plus[0].length));
  }

  // "3×10-12" — sets × a per-set rep range. Checked before the bare dash run so
  // the range isn't mistaken for a 2-number range; uses the top of the range.
  const setRange = s.match(/(\d+)\s*[x×]\s*(\d+)\s*-\s*(\d+)/i);
  if (setRange) return Number(setRange[1]) * Math.max(Number(setRange[2]), Number(setRange[3]));

  // Dash runs: a pyramid (3+ numbers) sums; a 2-number range takes its top.
  const dash = s.match(/\d+(?:\s*-\s*\d+)+/);
  if (dash) {
    const parts = dash[0].split("-").map((t) => Number(t.trim()));
    if (parts.length >= 3) {
      const sum = parts.reduce((a, b) => a + b, 0);
      return sum * trailingMultiplier(s.slice(dash.index! + dash[0].length));
    }
    return Math.max(...parts);
  }

  const timed = /\b(sec|secunda|secunde|min|minut|minute)\b/.test(lower);
  const rounds = lower.includes("runde");
  // A bare leading multiplier ("x 3 runde") counts rounds, not reps.
  const leadingRounds = /^x\s*\d/i.test(s);
  if ((timed || rounds || leadingRounds) && !hasReps) return null;

  // "3×10" / "4 x 12" — sets × reps (also how a uniform per-set scheme prints).
  const mult = s.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (mult) return Number(mult[1]) * Number(mult[2]);

  // "12, 10, 8" — a comma list of per-set reps (a varying scheme prints this way).
  const list = s.match(/\d+(?:\s*,\s*\d+)+/);
  if (list) return list[0].split(",").reduce((a, t) => a + Number(t.trim()), 0);

  const nums = s.match(/\d+/g);
  return nums ? Number(nums[0]) : null;
}

/**
 * Convert a legacy free-text prescription into a structured target. Parses to a
 * self-paced rep `volume` when a countable rep total can be read; otherwise keeps
 * the text as a display-only `note` (timed holds, round-based work, unparseable
 * imports). Shared by the importer, the seeded defaults, and the on-load migration
 * of pre-structured sheets.
 */
export function prescriptionToTarget(prescription: string): {
  target?: ExerciseTarget;
  note?: string;
} {
  const text = prescription.trim();
  if (text === "") return {};
  const reps = parseTargetReps(text);
  if (reps !== null && reps > 0) return { target: { kind: "volume", totalReps: reps } };
  return { note: text };
}

/**
 * Flatten a sheet into an ordered list of runnable items. Unnamed rows are
 * dropped — every added builder/routine row carries a default target, so a row
 * is only "real" once it has a name; an unnamed row would otherwise show as a
 * phantom "—" exercise in the run and exports.
 */
export function flattenSheet(sheet: RoutineSheet): RunItem[] {
  const items: RunItem[] = [];
  sheet.routines.forEach((routine, routineIndex) => {
    routine.exercises.forEach((ex, exerciseIndex) => {
      const target = ex.target;
      if (ex.name.trim() === "") return;
      // A per-set scheme drives the row set-by-set; a volume target gives a rep
      // total to count down; a note-only row has no countable target (manual done).
      const setTargets =
        target?.kind === "sets" && target.sets.length > 0 ? target.sets : undefined;
      const targetReps =
        target?.kind === "sets"
          ? target.sets.reduce((a, t) => a + t.reps, 0)
          : target?.kind === "volume"
            ? target.totalReps
            : null;
      // Identity: prefer fields carried on the RoutineExercise; otherwise try
      // a runtime name-match. Either source produces the same shape downstream.
      const carried =
        ex.exerciseId !== undefined && ex.muscle !== undefined && ex.equipment !== undefined;
      const identity = carried
        ? {
            exerciseId: ex.exerciseId,
            muscle: ex.muscle,
            equipment: ex.equipment,
            ...(ex.secondaryMuscles && ex.secondaryMuscles.length > 0
              ? { secondaryMuscles: [...ex.secondaryMuscles] }
              : {}),
          }
        : ((mv) =>
            mv
              ? {
                  exerciseId: mv.id,
                  muscle: mv.primaryMuscle,
                  equipment: mv.equipment,
                  ...(mv.secondaryMuscles.length > 0
                    ? { secondaryMuscles: [...mv.secondaryMuscles] }
                    : {}),
                }
              : {})(matchMovementByName(ex.name));
      items.push({
        routineIndex,
        routineTitle: routine.title,
        exerciseIndex,
        name: ex.name,
        prescription: formatTarget(ex),
        targetReps,
        ...(setTargets
          ? {
              setTargets: setTargets.map((t) => ({
                reps: t.reps,
                ...(t.loadKg !== undefined ? { loadKg: t.loadKg } : {}),
              })),
            }
          : {}),
        ...identity,
      });
    });
  });
  return items;
}

/**
 * What a run row is credited to when the run is saved to the log: the muscle,
 * load type and (optional) catalog identity that turn it into a LoggedExercise.
 * Auto-mapped from the exercise name where it matches the catalog; otherwise a
 * bodyweight placeholder the user confirms ({@link ExecuteController.exercise}).
 */
export interface RunExercise {
  muscle: MuscleGroup;
  equipment: Equipment;
  exerciseId?: string;
  secondaryMuscles?: readonly MuscleGroup[];
  /** True when the name matched a catalog movement; false = a placeholder to confirm. */
  mapped: boolean;
}

// Placeholder identity for an unmatched free-text row: bodyweight, weight 0 —
// the same least-wrong default sheetToSession uses for routine-loaded sessions.
const DEFAULT_MUSCLE: MuscleGroup = "chest";
const DEFAULT_EQUIPMENT: Equipment = "calisthenics";

/** Build a row's identity from a matched catalog movement. */
function mappedExercise(mv: Movement): RunExercise {
  return {
    muscle: mv.primaryMuscle,
    equipment: mv.equipment,
    exerciseId: mv.id,
    ...(mv.secondaryMuscles.length > 0 ? { secondaryMuscles: [...mv.secondaryMuscles] } : {}),
    mapped: true,
  };
}

/**
 * Execute state for a routine sheet: the user works each row to its rep target,
 * recording one set at a time until the prescribed volume is fulfilled. Unlike
 * the live runner there is no clock, no rest, and no auto-advance — progress is
 * entirely user-driven and sets may be logged in any order.
 *
 * Each recorded set is a {@link WorkSet} (reps plus optional weight / RIR), and
 * every row carries a {@link RunExercise} identity, so a finished or partial run
 * can be converted into a TrainingSession (see `executeRunToSession`) and fed
 * into the same effort / recovery / stats pipeline as a live session.
 *
 * Rows whose prescription has no countable rep target (timed holds, "x N
 * runde") fall back to a single manual done/undone toggle, which records one
 * placeholder set (optionally a hold duration / RIR) so they still count.
 */
export class ExecuteController {
  readonly items: RunItem[];
  /** Per item: the WorkSets recorded so far, in order. */
  private readonly logged: WorkSet[][];
  /** Per item: what it's credited to when saved to the log. */
  private readonly meta: RunExercise[];
  /** The row the focused "now" card drives. */
  private selected = 0;

  constructor(sheet: RoutineSheet) {
    this.items = flattenSheet(sheet);
    this.logged = this.items.map(() => []);
    this.meta = this.items.map((it) =>
      it.exerciseId !== undefined && it.muscle !== undefined && it.equipment !== undefined
        ? {
            muscle: it.muscle,
            equipment: it.equipment,
            exerciseId: it.exerciseId,
            ...(it.secondaryMuscles && it.secondaryMuscles.length > 0
              ? { secondaryMuscles: [...it.secondaryMuscles] }
              : {}),
            mapped: true,
          }
        : { muscle: DEFAULT_MUSCLE, equipment: DEFAULT_EQUIPMENT, mapped: false },
    );
    const first = this.firstIncompleteIndex();
    this.selected = first < 0 ? 0 : first;
  }

  get total(): number {
    return this.items.length;
  }

  targetReps(index: number): number | null {
    return this.items[index]?.targetReps ?? null;
  }

  /** Whether this row is a timed/hold row completed by a manual toggle (no rep target). */
  isManual(index: number): boolean {
    return this.targetReps(index) == null;
  }

  /** Total reps recorded so far for an item. */
  loggedReps(index: number): number {
    return (this.logged[index] ?? []).reduce((a, s) => a + s.reps, 0);
  }

  /** Reps recorded per set, for the "12 · 10 · 8" breakdown. */
  setReps(index: number): readonly number[] {
    return (this.logged[index] ?? []).map((s) => s.reps);
  }

  /** The WorkSets recorded for an item, for conversion / display. */
  workSets(index: number): readonly WorkSet[] {
    return this.logged[index] ?? [];
  }

  /** Total sets recorded across every row — whether the run has anything to save. */
  loggedSetCount(): number {
    return this.logged.reduce((sum, sets) => sum + sets.length, 0);
  }

  /** Reps still owed before the target is met (0 once fulfilled / untargeted). */
  remainingReps(index: number): number {
    const t = this.items[index]?.targetReps;
    if (t == null) return 0;
    return Math.max(0, t - this.loggedReps(index));
  }

  /** Structured per-set targets for a row, or null when it's free-text/manual. */
  private targetsFor(index: number): readonly SetTarget[] | null {
    const t = this.items[index]?.setTargets;
    return t && t.length > 0 ? t : null;
  }

  /** Number of prescribed sets for a structured row (0 when not structured). */
  targetSetCount(index: number): number {
    return this.targetsFor(index)?.length ?? 0;
  }

  /**
   * The target for the next set to log on a structured row — `setTargets[k]`
   * where k = sets logged so far. Null when not structured or all sets are in.
   */
  currentSetTarget(index: number): SetTarget | null {
    const targets = this.targetsFor(index);
    if (!targets) return null;
    return targets[this.logged[index]?.length ?? 0] ?? null;
  }

  /** Completion fraction in [0,1] for an item's progress bar. */
  fraction(index: number): number {
    const targets = this.targetsFor(index);
    if (targets) return Math.min(1, (this.logged[index]?.length ?? 0) / targets.length);
    const t = this.items[index]?.targetReps;
    if (t == null || t <= 0) return this.isDone(index) ? 1 : 0;
    return Math.min(1, this.loggedReps(index) / t);
  }

  isDone(index: number): boolean {
    const targets = this.targetsFor(index);
    if (targets) return (this.logged[index]?.length ?? 0) >= targets.length;
    const t = this.items[index]?.targetReps;
    if (t == null || t <= 0) return (this.logged[index]?.length ?? 0) > 0;
    return this.loggedReps(index) >= t;
  }

  /** Number of exercises fully completed. */
  completedCount(): number {
    let n = 0;
    for (let i = 0; i < this.total; i++) if (this.isDone(i)) n++;
    return n;
  }

  allDone(): boolean {
    return this.total > 0 && this.completedCount() === this.total;
  }

  // ---- Exercise identity (what a row counts as) ----------------------------
  /** The identity a row is credited to when saved. undefined for an out-of-range index. */
  exercise(index: number): RunExercise | undefined {
    return this.meta[index];
  }

  /** Point a row at a catalog movement, syncing its muscle / load type / secondaries. */
  setMovement(index: number, id: string): void {
    const mv = findMovement(id);
    if (!mv || !this.meta[index]) return;
    this.meta[index] = mappedExercise(mv);
  }

  /** Switch a row's muscle group, defaulting to that group's first movement. */
  setMuscle(index: number, muscle: MuscleGroup): void {
    const first = movementsForMuscle(muscle)[0];
    if (first) this.setMovement(index, first.id);
  }

  // ---- Rep-volume aggregates (over rep-target rows only) -------------------
  totalTargetReps(): number {
    return this.items.reduce((sum, it) => sum + (it.targetReps ?? 0), 0);
  }

  /** Reps fulfilled toward the grand total, capped per item at its target. */
  doneReps(): number {
    let sum = 0;
    this.items.forEach((it, i) => {
      if (it.targetReps != null) sum += Math.min(this.loggedReps(i), it.targetReps);
    });
    return sum;
  }

  // ---- Selection -----------------------------------------------------------
  selectedIndex(): number {
    return this.selected;
  }

  select(index: number): void {
    if (index >= 0 && index < this.total) this.selected = index;
  }

  /** First not-done item — what the focused card defaults to. -1 when none. */
  firstIncompleteIndex(): number {
    for (let i = 0; i < this.total; i++) if (!this.isDone(i)) return i;
    return -1;
  }

  // ---- Mutations -----------------------------------------------------------
  /**
   * Record one set of `reps` against an item; ignores non-positive input.
   * Optional `weightKg` (added/external load) and `rir` (reps in reserve) are
   * stored when given so the run carries the same intensity signal as a live log.
   */
  logSet(index: number, reps: number, opts?: { weightKg?: number; rir?: number }): void {
    if (index < 0 || index >= this.total) return;
    const n = Math.floor(reps);
    if (!Number.isFinite(n) || n <= 0) return;
    const weightKg = opts?.weightKg;
    const rir = opts?.rir;
    this.logged[index]!.push({
      reps: n,
      weightKg: typeof weightKg === "number" && weightKg > 0 ? weightKg : 0,
      ...(typeof rir === "number" && rir >= 0 ? { rir } : {}),
    });
    this.advanceIfDone(index);
  }

  /** Remove the most recent set from an item (undo a mistaken tap). */
  undoSet(index: number): void {
    if (index < 0 || index >= this.total) return;
    this.logged[index]!.pop();
  }

  /**
   * Flip a timed/hold (no rep target) item's done state. Marking done records a
   * single placeholder set (reps 0); an optional hold `durationSec` and `rir`
   * give it real time-under-tension / intensity so the row still feeds effort.
   */
  toggleManual(index: number, meta?: { durationSec?: number; rir?: number }): void {
    if (index < 0 || index >= this.total) return;
    const sets = this.logged[index]!;
    if (sets.length > 0) {
      sets.length = 0;
      return;
    }
    const durationSec = meta?.durationSec;
    const rir = meta?.rir;
    sets.push({
      reps: 0,
      weightKg: 0,
      ...(typeof durationSec === "number" && durationSec > 0 ? { durationSec } : {}),
      ...(typeof rir === "number" && rir >= 0 ? { rir } : {}),
    });
    this.advanceIfDone(index);
  }

  reset(): void {
    this.logged.forEach((sets) => (sets.length = 0));
    const first = this.firstIncompleteIndex();
    this.selected = first < 0 ? 0 : first;
  }

  /** When the focused item just got finished, jump focus to the next one. */
  private advanceIfDone(index: number): void {
    if (index !== this.selected || !this.isDone(index)) return;
    const next = this.firstIncompleteIndex();
    if (next >= 0) this.selected = next;
  }
}
