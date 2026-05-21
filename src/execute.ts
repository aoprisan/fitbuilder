import type { RoutineSheet } from "./types";

/** One runnable line in an execute run — a single exercise within a routine. */
export interface RunItem {
  /** Index of the parent routine within the sheet. */
  routineIndex: number;
  /** The parent routine's title, denormalized for display. */
  routineTitle: string;
  /** 0-based position of this exercise within its routine. */
  exerciseIndex: number;
  name: string;
  /** Free-text prescription, e.g. "30-50 repetari". */
  prescription: string;
  /**
   * Total rep volume to fulfil, parsed from the prescription, or null when the
   * work is timed / hold / round-based and has no countable rep target (those
   * rows are completed by a manual "done" tap instead).
   */
  targetReps: number | null;
}

/** Read a trailing "x N" multiplier (e.g. " x 5", " x3"); defaults to 1. */
function trailingMultiplier(rest: string): number {
  const m = rest.match(/x\s*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

/**
 * Best-effort parse of a free-text prescription into a total rep target.
 * Returns null when the work is timed or round-based (e.g. "20 secunde x 5",
 * "x 3 runde") and therefore carries no countable rep volume.
 *
 * Rules (first match wins), after stripping parenthetical tempo notes:
 *  - "5+5+5 x 5"  → sum of the plus-group × trailing multiplier        → 75
 *  - "1-2-3-2-1"  → pyramid (3+ dash-separated numbers): sum × mult    → 9
 *  - "30-50 …"    → range (exactly 2 dash-separated numbers): the top  → 50
 *  - timed / round-only with no "repet…" keyword                       → null
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

  const nums = s.match(/\d+/g);
  return nums ? Number(nums[0]) : null;
}

/**
 * Flatten a sheet into an ordered list of runnable items. Completely blank
 * rows (no name and no prescription) are dropped so empty builder rows don't
 * inflate the run.
 */
export function flattenSheet(sheet: RoutineSheet): RunItem[] {
  const items: RunItem[] = [];
  sheet.routines.forEach((routine, routineIndex) => {
    routine.exercises.forEach((ex, exerciseIndex) => {
      if (ex.name.trim() === "" && ex.prescription.trim() === "") return;
      items.push({
        routineIndex,
        routineTitle: routine.title,
        exerciseIndex,
        name: ex.name,
        prescription: ex.prescription,
        targetReps: parseTargetReps(ex.prescription),
      });
    });
  });
  return items;
}

/**
 * Execute state for a routine sheet: the user works each row to its rep target,
 * recording one set at a time until the prescribed volume is fulfilled. Unlike
 * {@link SessionController} there is no clock, no rest, and no auto-advance —
 * progress is entirely user-driven and sets may be logged in any order.
 *
 * Rows whose prescription has no countable rep target (timed holds, "x N
 * runde") fall back to a single manual done/undone toggle.
 */
export class ExecuteController {
  readonly items: RunItem[];
  /** Per item: the reps recorded for each completed set, in order. */
  private readonly sets: number[][];
  /** Timed/hold items the user has manually marked done (no rep target). */
  private readonly manualDone = new Set<number>();
  /** The row the focused "now" card drives. */
  private selected = 0;

  constructor(sheet: RoutineSheet) {
    this.items = flattenSheet(sheet);
    this.sets = this.items.map(() => []);
    const first = this.firstIncompleteIndex();
    this.selected = first < 0 ? 0 : first;
  }

  get total(): number {
    return this.items.length;
  }

  targetReps(index: number): number | null {
    return this.items[index]?.targetReps ?? null;
  }

  /** Total reps recorded so far for an item. */
  loggedReps(index: number): number {
    return (this.sets[index] ?? []).reduce((a, b) => a + b, 0);
  }

  /** Reps recorded per set, for the "12 · 10 · 8" breakdown. */
  setReps(index: number): readonly number[] {
    return this.sets[index] ?? [];
  }

  /** Reps still owed before the target is met (0 once fulfilled / untargeted). */
  remainingReps(index: number): number {
    const t = this.items[index]?.targetReps;
    if (t == null) return 0;
    return Math.max(0, t - this.loggedReps(index));
  }

  /** Completion fraction in [0,1] for an item's progress bar. */
  fraction(index: number): number {
    const t = this.items[index]?.targetReps;
    if (t == null || t <= 0) return this.isDone(index) ? 1 : 0;
    return Math.min(1, this.loggedReps(index) / t);
  }

  isDone(index: number): boolean {
    const t = this.items[index]?.targetReps;
    if (t == null || t <= 0) return this.manualDone.has(index);
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
  /** Record one set of `reps` against an item; ignores non-positive input. */
  logSet(index: number, reps: number): void {
    if (index < 0 || index >= this.total) return;
    const n = Math.floor(reps);
    if (!Number.isFinite(n) || n <= 0) return;
    this.sets[index]!.push(n);
    this.advanceIfDone(index);
  }

  /** Remove the most recent set from an item (undo a mistaken tap). */
  undoSet(index: number): void {
    if (index < 0 || index >= this.total) return;
    this.sets[index]!.pop();
  }

  /** Flip a timed/hold (no rep target) item's done state. */
  toggleManual(index: number): void {
    if (index < 0 || index >= this.total) return;
    if (this.manualDone.has(index)) {
      this.manualDone.delete(index);
    } else {
      this.manualDone.add(index);
      this.advanceIfDone(index);
    }
  }

  reset(): void {
    this.sets.forEach((s) => (s.length = 0));
    this.manualDone.clear();
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
