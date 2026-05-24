import { setEffort } from "./effort";
import type { MuscleGroup, TrainingSession } from "./types";
import { MUSCLE_GROUPS } from "./types";
import { clamp } from "./util";

const HOUR_MS = 3_600_000;

/**
 * Hours after training a muscle group until it's treated as fully recovered.
 * Larger, slower-recovering groups get longer windows than small ones.
 */
export const RECOVERY_HOURS: Record<MuscleGroup, number> = {
  chest: 48,
  back: 60,
  shoulders: 48,
  biceps: 36,
  triceps: 36,
  legs: 72,
  glutes: 60,
  core: 24,
  forearms: 24,
  calves: 36,
};

export interface MuscleRecovery {
  muscle: MuscleGroup;
  /** ISO timestamp this muscle was last trained, or null if never trained. */
  lastTrainedAt: string | null;
  /** Recovery fraction 0..1: 0 = just trained (red), 1 = fully recovered (green). */
  recovered: number;
  /** Whole hours left until fully recovered (0 once ready). */
  hoursRemaining: number;
}

/**
 * Per-muscle recovery readiness derived from logged training history. A muscle
 * counts as trained when it is the primary OR a secondary muscle of an exercise
 * that has at least one logged set. Returned least-recovered first, so what still
 * needs rest leads; never-trained groups read as fully ready and sink to the end.
 */
export function muscleRecovery(
  sessions: readonly TrainingSession[],
  now: Date = new Date(),
): MuscleRecovery[] {
  const lastTrained = new Map<MuscleGroup, { at: number; iso: string }>();
  const mark = (muscle: MuscleGroup, at: number, iso: string): void => {
    const prev = lastTrained.get(muscle);
    if (prev === undefined || at > prev.at) lastTrained.set(muscle, { at, iso });
  };

  for (const session of sessions) {
    const at = new Date(session.startedAt).getTime();
    if (Number.isNaN(at)) continue;
    for (const ex of session.exercises) {
      if (ex.sets.length === 0) continue;
      mark(ex.muscle, at, session.startedAt);
      for (const sec of ex.secondaryMuscles ?? []) mark(sec, at, session.startedAt);
    }
  }

  const nowMs = now.getTime();
  return MUSCLE_GROUPS.map((muscle): MuscleRecovery => {
    const entry = lastTrained.get(muscle);
    if (entry === undefined) {
      return { muscle, lastTrainedAt: null, recovered: 1, hoursRemaining: 0 };
    }
    const window = RECOVERY_HOURS[muscle];
    const hoursSince = (nowMs - entry.at) / HOUR_MS;
    return {
      muscle,
      lastTrainedAt: entry.iso,
      recovered: clamp(hoursSince / window, 0, 1),
      hoursRemaining: Math.max(0, Math.ceil(window - hoursSince)),
    };
  }).sort(
    (a, b) => a.recovered - b.recovered || RECOVERY_HOURS[b.muscle] - RECOVERY_HOURS[a.muscle],
  );
}

/** Overall body readiness: the average recovery across all muscle groups (0..1). */
export function overallRecovery(recoveries: readonly MuscleRecovery[]): number {
  if (recoveries.length === 0) return 1;
  const sum = recoveries.reduce((acc, r) => acc + r.recovered, 0);
  return sum / recoveries.length;
}

/* =============================================================================
   Systemic / nervous-system fatigue — a whole-body load that lingers after hard
   sessions, kept separate from per-muscle recovery. Unlike the time-only muscle
   clock this is intensity-aware: recent session effort (weighted up for heavy,
   low-rep work, which taxes the CNS most) accumulates and decays over a multi-day
   window, so back-to-back hard days stack up and a brutal day costs more rest
   than a light one.
   ========================================================================== */

// CNS load roughly halves every this-many hours; tuned longer than muscle windows.
const CNS_HALF_LIFE_HOURS = 40;
// Decayed load (in "typical sessions") at which systemic readiness bottoms out.
const CNS_SATURATION = 2.5;
// Reference session load when there's no history to calibrate against.
const CNS_FALLBACK_LOAD = 45;

/** CNS demand of a set relative to its effort: heavy/low-rep work taxes the most. */
function repsIntensity(reps: number): number {
  if (reps <= 5) return 1.6; // strength / heavy singles & triples
  if (reps <= 12) return 1; // hypertrophy
  return 0.6; // high-rep / endurance
}

/** Intensity-weighted CNS load of one session. */
function sessionCnsLoad(session: TrainingSession): number {
  let load = 0;
  for (const ex of session.exercises) {
    for (const s of ex.sets) load += setEffort(s) * repsIntensity(s.reps);
  }
  return load;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Readiness at which systemic load counts as cleared — matches the "Rested" band.
const CNS_RESTED = 0.85;

export interface SystemicRecovery {
  /** Systemic readiness 0..1: 0 = heavily fatigued (red), 1 = fully fresh (green). */
  readiness: number;
  /**
   * Whole hours until systemic load decays back to rested (0 once rested).
   * Because CNS load decays exponentially, this targets the top "Rested" band
   * rather than a literal 100%, whose asymptotic tail would read as many days.
   */
  hoursRemaining: number;
}

/**
 * Whole-body systemic (nervous-system) recovery. `readiness` is 0..1: 0 = heavily
 * fatigued (red), 1 = fully fresh (green). Pools recent sessions' intensity-weighted
 * load with exponential time-decay, measured against a typical session, then projects
 * that same decay forward to estimate the hours left until systemic load clears.
 */
export function systemicRecovery(
  sessions: readonly TrainingSession[],
  now: Date = new Date(),
): SystemicRecovery {
  const nowMs = now.getTime();
  const loads: number[] = [];
  let decayed = 0;
  for (const session of sessions) {
    const at = new Date(session.startedAt).getTime();
    if (Number.isNaN(at)) continue;
    const load = sessionCnsLoad(session);
    if (load <= 0) continue;
    loads.push(load);
    const hoursSince = (nowMs - at) / HOUR_MS;
    if (hoursSince < 0) continue; // future-dated; counts toward reference, not load
    decayed += load * Math.pow(0.5, hoursSince / CNS_HALF_LIFE_HOURS);
  }
  if (loads.length === 0) return { readiness: 1, hoursRemaining: 0 };
  const saturation = (median(loads) || CNS_FALLBACK_LOAD) * CNS_SATURATION;
  const readiness = clamp(1 - decayed / saturation, 0, 1);

  // The pool decays uniformly: decayed(t) = decayed · 0.5^(t / half-life). Solve for
  // the hours until that projected load drops to the rested threshold's load.
  const restedLoad = saturation * (1 - CNS_RESTED);
  const hoursRemaining =
    decayed <= restedLoad ? 0 : Math.ceil(CNS_HALF_LIFE_HOURS * Math.log2(decayed / restedLoad));

  return { readiness, hoursRemaining };
}
