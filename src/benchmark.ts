import type { LoggedExercise, SetTarget, TrainingSession, WorkSet } from "./types";
import { formatSetTargets, formatVolumeTarget, round2 } from "./util";

/**
 * Benchmarking a logged exercise / session against the trainer's structured
 * guideline (`LoggedExercise.target`, carried in by `sheetToSession` / Execute
 * runs). Everything here is pure: given what was logged and what was prescribed,
 * it computes how the work compares — driving the live per-set benchmark and the
 * session "adherence to plan" read. Exercises with no carried target are skipped,
 * so freestyle / off-plan logs contribute nothing and behave exactly as before.
 */

/** One prescribed-vs-logged set pairing for the per-set benchmark list. */
export interface SetComparison {
  /** 0-based set number. */
  index: number;
  /** What the trainer prescribed for this set; absent for an extra (off-plan) set. */
  target?: SetTarget;
  /** What was actually logged; absent for a prescribed set not done yet. */
  logged?: WorkSet;
}

/** How a logged exercise compares to its carried guideline. */
export interface ExerciseBenchmark {
  kind: "sets" | "volume";
  /** Human label of the guideline, e.g. "3×10 @ 20kg" or "50 reps". */
  label: string;
  /** Total prescribed reps (Σ set reps, or the volume total). */
  prescribedReps: number;
  /** Total logged reps so far. */
  doneReps: number;
  /** done / prescribed, clamped to [0,1] — drives the progress bar. */
  fraction: number;
  /** Prescribed load in kg (avg across loaded sets, or the volume load); null when bodyweight. */
  targetLoadKg: number | null;
  /** Average logged load in kg across sets carrying weight; null when none. */
  loggedLoadKg: number | null;
  /** Per-set prescribed-vs-logged rows; empty for a volume target. */
  sets: SetComparison[];
}

/** Average of a list of numbers, or null when empty. */
function avg(nums: readonly number[]): number | null {
  if (nums.length === 0) return null;
  return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/**
 * The prescribed target for the *next* set to log on a per-set guideline —
 * `target.sets[k]` where k = sets already logged. Null when the exercise has no
 * per-set guideline or every prescribed set is already in. Lets the live dial
 * pre-fill to what the trainer asked for.
 */
export function nextSetTarget(ex: LoggedExercise): SetTarget | null {
  if (ex.target?.kind !== "sets") return null;
  return ex.target.sets[ex.sets.length] ?? null;
}

/**
 * Compare a logged exercise to its carried guideline. Returns null when the
 * exercise has no structured target (freestyle / off-plan / legacy log), in
 * which case callers fall back to the free-text prescription tally.
 */
export function exerciseBenchmark(ex: LoggedExercise): ExerciseBenchmark | null {
  const target = ex.target;
  if (!target) return null;

  const doneReps = ex.sets.reduce((a, s) => a + s.reps, 0);
  const loggedLoadKg = avg(ex.sets.filter((s) => s.weightKg > 0).map((s) => s.weightKg));

  if (target.kind === "volume") {
    const prescribedReps = target.totalReps;
    return {
      kind: "volume",
      label: formatVolumeTarget(target),
      prescribedReps,
      doneReps,
      fraction: prescribedReps > 0 ? Math.min(1, doneReps / prescribedReps) : 0,
      targetLoadKg: target.loadKg !== undefined && target.loadKg > 0 ? round2(target.loadKg) : null,
      loggedLoadKg,
      sets: [],
    };
  }

  const prescribedReps = target.sets.reduce((a, s) => a + s.reps, 0);
  const count = Math.max(target.sets.length, ex.sets.length);
  const sets: SetComparison[] = [];
  for (let i = 0; i < count; i++) {
    const planned = target.sets[i];
    const logged = ex.sets[i];
    sets.push({
      index: i,
      ...(planned ? { target: planned } : {}),
      ...(logged ? { logged } : {}),
    });
  }
  return {
    kind: "sets",
    label: formatSetTargets(target.sets),
    prescribedReps,
    doneReps,
    fraction: prescribedReps > 0 ? Math.min(1, doneReps / prescribedReps) : 0,
    targetLoadKg: avg(
      target.sets.filter((s) => s.loadKg !== undefined && s.loadKg > 0).map((s) => s.loadKg!),
    ),
    loggedLoadKg,
    sets,
  };
}

/** One planned exercise's benchmark, paired with its display name. */
export interface AdherenceRow {
  name: string;
  benchmark: ExerciseBenchmark;
}

/** A session's overall adherence to the plan it was started from. */
export interface SessionAdherence {
  rows: AdherenceRow[];
  /** Total prescribed reps across planned exercises. */
  prescribedReps: number;
  /** Total reps done, capped per exercise at its prescription (so overshoot ≠ >100%). */
  doneReps: number;
  /** doneReps / prescribedReps as a 0–100 percentage. */
  pct: number;
}

/**
 * How a whole session measured up to the trainer's plan: per-exercise benchmarks
 * plus an overall percentage. Built only over exercises carrying a structured
 * target, so a session never started from a routine (no guidelines) returns null
 * and the adherence panel simply doesn't appear.
 */
export function sessionAdherence(session: TrainingSession): SessionAdherence | null {
  const rows: AdherenceRow[] = [];
  let prescribedReps = 0;
  let doneReps = 0;
  for (const ex of session.exercises) {
    const benchmark = exerciseBenchmark(ex);
    if (!benchmark || benchmark.prescribedReps <= 0) continue;
    rows.push({ name: ex.name, benchmark });
    prescribedReps += benchmark.prescribedReps;
    doneReps += Math.min(benchmark.doneReps, benchmark.prescribedReps);
  }
  if (rows.length === 0 || prescribedReps <= 0) return null;
  return {
    rows,
    prescribedReps,
    doneReps,
    pct: Math.round((doneReps / prescribedReps) * 100),
  };
}
