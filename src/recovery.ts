import { fatigueProximity, setEffort } from "./effort";
import { cnsFactor, muscleDemandFactor } from "./loadProfile";
import { SECONDARY_MUSCLE_SHARE } from "./movements";
import type { LoggedExercise, MuscleGroup, TrainingSession } from "./types";
import { MUSCLE_GROUPS } from "./types";
import { clamp } from "./util";

const HOUR_MS = 3_600_000;

/** A lift counts as compound when it taxes secondary muscles. */
function isCompound(ex: LoggedExercise): boolean {
  return (ex.secondaryMuscles?.length ?? 0) > 0;
}

/**
 * Hours after training a muscle group until it's treated as fully recovered.
 * Larger, slower-recovering groups get longer windows than small ones.
 */
export const RECOVERY_HOURS: Record<MuscleGroup, number> = {
  chest: 48,
  back: 60,
  shoulders: 48,
  traps: 48,
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

// The base RECOVERY_HOURS window assumes a typical hard bout for a muscle. The
// most-recent bout's recovery demand stretches or shrinks it around that
// reference: a light machine-isolation pump clears faster, a heavy free-weight
// compound day needs longer. Bounded so the clock stays sensible either way.
const RECOVERY_REF_DEMAND = 16;
const RECOVERY_SCALE_MIN = 0.6;
const RECOVERY_SCALE_MAX = 1.6;

interface MuscleBout {
  at: number;
  iso: string;
  /** Recovery demand of this most-recent bout (effort × equipment/compound × share). */
  demand: number;
}

/**
 * Per-muscle recovery readiness derived from logged training history. A muscle
 * counts as trained when it is the primary OR a secondary muscle of an exercise
 * that has at least one logged set. The recovery window is scaled by the demand
 * of the muscle's most recent bout — heavier / compound / free-weight work needs
 * longer than light supported isolation. Returned least-recovered first, so what
 * still needs rest leads; never-trained groups read as fully ready and sink to
 * the end.
 */
export function muscleRecovery(
  sessions: readonly TrainingSession[],
  now: Date = new Date(),
): MuscleRecovery[] {
  const lastTrained = new Map<MuscleGroup, MuscleBout>();
  const mark = (muscle: MuscleGroup, at: number, iso: string, demand: number): void => {
    const prev = lastTrained.get(muscle);
    if (prev === undefined || at > prev.at) {
      // A newer bout replaces the clock and resets accumulated demand.
      lastTrained.set(muscle, { at, iso, demand });
    } else if (at === prev.at) {
      // Same bout, another set's worth of demand on this muscle.
      prev.demand += demand;
    }
  };

  for (const session of sessions) {
    const at = new Date(session.startedAt).getTime();
    if (Number.isNaN(at)) continue;
    for (const ex of session.exercises) {
      if (ex.sets.length === 0) continue;
      const compound = isCompound(ex);
      const demandFactor = muscleDemandFactor(ex.equipment, compound);
      for (const s of ex.sets) {
        // Proximity to failure scales local damage: a set taken to failure
        // demands more recovery than the same set stopped well short.
        const demand = setEffort(s, ex.equipment) * demandFactor * fatigueProximity(s.rir);
        mark(ex.muscle, at, session.startedAt, demand);
        for (const sec of ex.secondaryMuscles ?? [])
          mark(sec, at, session.startedAt, demand * SECONDARY_MUSCLE_SHARE);
      }
    }
  }

  const nowMs = now.getTime();
  return MUSCLE_GROUPS.map((muscle): MuscleRecovery => {
    const entry = lastTrained.get(muscle);
    if (entry === undefined) {
      return { muscle, lastTrainedAt: null, recovered: 1, hoursRemaining: 0 };
    }
    const scale = clamp(
      entry.demand / RECOVERY_REF_DEMAND,
      RECOVERY_SCALE_MIN,
      RECOVERY_SCALE_MAX,
    );
    const window = RECOVERY_HOURS[muscle] * scale;
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

// Theme press inks as RGB: signal red (0.0) → ochre (0.5) → field green (1.0).
const RED: readonly [number, number, number] = [0xd6, 0x42, 0x2b];
const AMBER: readonly [number, number, number] = [0xc9, 0x96, 0x2a];
const GREEN: readonly [number, number, number] = [0x3a, 0x5a, 0x40];

/** Map a 0..1 recovery fraction to a red→amber→green colour string. */
export function recoveryColor(recovered: number): string {
  const t = clamp(recovered, 0, 1);
  const [from, to, seg] =
    t < 0.5 ? ([RED, AMBER, t / 0.5] as const) : ([AMBER, GREEN, (t - 0.5) / 0.5] as const);
  const mix = (i: number): number => Math.round(from[i]! + (to[i]! - from[i]!) * seg);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** Short status word for an overall recovery fraction. */
export function overallStatus(recovered: number): string {
  if (recovered >= 0.85) return "Rested";
  if (recovered >= 0.6) return "Ready";
  if (recovered >= 0.35) return "Recovering";
  return "Rest up";
}

/** One-line read on systemic load, with an estimate of hours back to rested. */
export function systemicNote(readiness: number, hoursRemaining: number): string {
  const eta = hoursRemaining > 0 ? ` ~${hoursRemaining}h to fully recover.` : "";
  if (readiness >= 0.85) return "Systemic load is low — fully fresh for hard work.";
  if (readiness >= 0.6) return "Systemic load is moderate — you can train hard." + eta;
  if (readiness >= 0.35) return "Systemic load is building — keep total volume in check." + eta;
  return "Systemic load is high — favour light work or a rest day." + eta;
}

/* =============================================================================
   Systemic fatigue — a whole-body load that lingers after hard sessions, kept
   separate from per-muscle recovery. It stands in for the fatigue that isn't
   captured by a single muscle's clock: accumulated muscle damage, connective-
   tissue and perceived/whole-body tiredness (plus a smaller nervous-system
   share — resistance-training fatigue is mostly peripheral, not central). Unlike
   the time-only muscle clock this is intensity-aware: recent session load —
   weighted by proximity to failure, total volume, and a gentler nudge for heavy
   low-rep work — accumulates and decays over a multi-day window, so back-to-back
   hard days stack up and a brutal day costs more rest than a light one.
   ========================================================================== */

// CNS load roughly halves every this-many hours; kept short so normal training-day
// spacing decays between sessions instead of stacking into chronic fatigue.
const CNS_HALF_LIFE_HOURS = 24;
// Decayed load (in "typical sessions") at which systemic readiness bottoms out. Set
// high enough that consistent every-other-day training still reads as ready — only
// daily-hard or genuinely brutal, back-to-back work drives the gauge into the red.
const CNS_SATURATION = 4.5;
// Reference session load when there's no history to calibrate against.
const CNS_FALLBACK_LOAD = 45;

/**
 * Rep-range weighting of a set's systemic cost. Heavy, low-rep work taxes the
 * system somewhat more, but the spread is deliberately gentle: resistance-training
 * fatigue is mostly peripheral, and measured *central* fatigue is modest and
 * fairly similar across loads — so this no longer treats heavy sets as a fatigue
 * bomb. Proximity to failure (applied separately) does most of the differentiating.
 */
function repsIntensity(reps: number): number {
  if (reps <= 5) return 1.2; // strength / heavy singles & triples
  if (reps <= 12) return 1; // hypertrophy
  return 0.85; // high-rep / endurance
}

/**
 * Intensity-weighted systemic load of one session. Each set's effort is scaled
 * by three factors: how close to failure it was taken (the dominant driver),
 * its rep-range weighting, and its equipment/compound factor (guided machine
 * isolation costs less than a free-weight compound at the same effort). This
 * layers on the effective-load discount already baked into {@link setEffort} —
 * fidelity captures lighter resistance, these capture lower systemic cost per
 * unit of it.
 */
function sessionCnsLoad(session: TrainingSession): number {
  let load = 0;
  for (const ex of session.exercises) {
    const factor = cnsFactor(ex.equipment, isCompound(ex));
    for (const s of ex.sets)
      load += setEffort(s, ex.equipment) * repsIntensity(s.reps) * factor * fatigueProximity(s.rir);
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
