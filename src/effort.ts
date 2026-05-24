import { SECONDARY_MUSCLE_SHARE } from "./movements";
import type { MuscleGroup, TrainingSession, WorkSet } from "./types";

/**
 * Live-session effort and hydration heuristics.
 *
 * Effort accumulates as work is logged: each set adds "effort points" drawn
 * from the act of doing the set, the reps, the volume (reps × load), and the
 * time under tension. The running total only grows across a session, so it
 * reads naturally as a gauge that fills as more exercises are done.
 *
 * The gauge is then calibrated against *previous work*: when the user has a
 * training history we compare the current total to the median of their past
 * sessions, so "a full bar" means "a normal session for you". Without history
 * we fall back to an absolute full-session target.
 *
 * Hydration is driven by the same effort points (a proxy for how hard the body
 * is working / sweating), so the recommended fluid intake climbs alongside the
 * effort gauge rather than tracking idle wall-clock time.
 */

// What a single hard working set is worth, roughly, in effort points: a base
// for the set itself, plus reps, plus volume load, plus time under tension.
const REPS_PER_POINT = 10; // 10 reps ≈ 1 point
const VOLUME_PER_POINT = 300; // 300 kg of (reps × load) ≈ 1 point
const SECONDS_PER_POINT = 120; // 2 min under tension ≈ 1 point

// Effort points a typical full session is worth when there's no history to
// calibrate against (a first session). ~12–16 solid sets land near here.
const FULL_SESSION_EFFORT = 45;

// Recommended fluid (ml) per effort point — tuned so a full session (~45 pts)
// suggests ≈ 0.8 L, a brutal one north of a litre.
const ML_PER_EFFORT_POINT = 18;
const ML_PER_GLASS = 250;

/** Effort points contributed by a single logged set. */
export function setEffort(set: WorkSet): number {
  const volume = set.reps * Math.max(0, set.weightKg);
  const duration = set.durationSec ?? 0;
  return (
    1 +
    set.reps / REPS_PER_POINT +
    volume / VOLUME_PER_POINT +
    duration / SECONDS_PER_POINT
  );
}

/** Accumulated effort points across every logged set in a session. */
export function sessionEffort(session: TrainingSession): number {
  let total = 0;
  for (const ex of session.exercises) {
    for (const s of ex.sets) total += setEffort(s);
  }
  return total;
}

/**
 * Median effort of the user's prior sessions, used to calibrate the gauge.
 * The active session is excluded so it never anchors against itself. Returns 0
 * when there's no usable history.
 */
export function typicalEffort(history: TrainingSession[], excludeId?: string): number {
  const efforts = history
    .filter((s) => s.id !== excludeId)
    .map(sessionEffort)
    .filter((e) => e > 0)
    .sort((a, b) => a - b);
  if (efforts.length === 0) return 0;
  const mid = Math.floor(efforts.length / 2);
  return efforts.length % 2 === 1
    ? efforts[mid]!
    : (efforts[mid - 1]! + efforts[mid]!) / 2;
}

export type EffortTier = "warmup" | "light" | "moderate" | "solid" | "hard" | "brutal";

// Tiers keyed off the gauge ratio (current effort ÷ a full session's worth).
// Picked highest-first by descending threshold.
const TIERS: ReadonlyArray<{ tier: EffortTier; label: string; min: number }> = [
  { tier: "brutal", label: "Brutal", min: 1.3 },
  { tier: "hard", label: "Hard", min: 1.0 },
  { tier: "solid", label: "Solid", min: 0.7 },
  { tier: "moderate", label: "Moderate", min: 0.4 },
  { tier: "light", label: "Light", min: 0.15 },
  { tier: "warmup", label: "Warm-up", min: 0 },
];

export interface EffortReading {
  /** Raw accumulated effort points. */
  points: number;
  /** Gauge fill, current effort ÷ full-session target (can exceed 1). */
  ratio: number;
  tier: EffortTier;
  label: string;
  /** Current effort as a % of the user's typical session, or null with no history. */
  vsTypicalPct: number | null;
}

/** Read the current effort gauge for a session, calibrated against history. */
export function readEffort(session: TrainingSession, history: TrainingSession[]): EffortReading {
  const points = sessionEffort(session);
  const typical = typicalEffort(history, session.id);
  const target = typical > 0 ? typical : FULL_SESSION_EFFORT;
  const ratio = points / target;
  const { tier, label } = TIERS.find((t) => ratio >= t.min) ?? TIERS[TIERS.length - 1]!;
  return {
    points,
    ratio,
    tier,
    label,
    vsTypicalPct: typical > 0 ? Math.round((points / typical) * 100) : null,
  };
}

export interface HydrationReading {
  /** Recommended fluid so far, ml, rounded to the nearest 50. */
  ml: number;
  /** Same figure in litres, one decimal. */
  liters: number;
  /** Whole 250 ml glasses. */
  glasses: number;
  /** Short, effort-aware cue. */
  note: string;
}

export interface MuscleWork {
  muscle: MuscleGroup;
  /** Σ reps × load, kg (0 for purely bodyweight work). */
  volume: number;
  /** Σ set duration, seconds. */
  timeSec: number;
  sets: number;
  /** Σ effort points contributed by this muscle's sets. */
  effort: number;
}

/** Per-muscle work across the given sessions, busiest first (by volume, then time). */
function accumulateMuscleWork(sessions: Iterable<TrainingSession>): MuscleWork[] {
  const byMuscle = new Map<MuscleGroup, MuscleWork>();
  const credit = (muscle: MuscleGroup, set: WorkSet, share: number): void => {
    const entry =
      byMuscle.get(muscle) ?? { muscle, volume: 0, timeSec: 0, sets: 0, effort: 0 };
    entry.volume += set.reps * Math.max(0, set.weightKg) * share;
    entry.timeSec += (set.durationSec ?? 0) * share;
    entry.sets += 1;
    entry.effort += setEffort(set) * share;
    byMuscle.set(muscle, entry);
  };
  for (const session of sessions) {
    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        // Primary muscle takes full credit; a compound lift's secondary muscles
        // each take a fixed share so they register as worked in the breakdown.
        credit(ex.muscle, s, 1);
        for (const sec of ex.secondaryMuscles ?? []) credit(sec, s, SECONDARY_MUSCLE_SHARE);
      }
    }
  }
  return [...byMuscle.values()]
    .map((m) => ({
      ...m,
      volume: Math.round(m.volume),
      timeSec: Math.round(m.timeSec),
      effort: Math.round(m.effort * 10) / 10,
    }))
    .sort((a, b) => b.volume - a.volume || b.timeSec - a.timeSec);
}

/** Per-muscle-group work in a session, busiest first (by volume, then time). */
export function muscleBreakdown(session: TrainingSession): MuscleWork[] {
  return accumulateMuscleWork([session]);
}

// Recovery-protein estimate: a minimum effective dose for muscle protein
// synthesis, scaled up by how hard the session was and how many muscle groups
// it taxed. Bodyweight-only sessions still register via their effort points.
const PROTEIN_BASE_G = 15;
const PROTEIN_PER_EFFORT = 0.4;
const PROTEIN_PER_MUSCLE = 2;

/** Estimated protein (g) to support recovery from this session, rounded to 5 g. */
export function estimateProteinG(effort: EffortReading, muscleCount: number): number {
  const raw =
    PROTEIN_BASE_G + effort.points * PROTEIN_PER_EFFORT + muscleCount * PROTEIN_PER_MUSCLE;
  return Math.round(raw / 5) * 5;
}

const HYDRATION_NOTES: Record<EffortTier, string> = {
  warmup: "Take a few sips to start.",
  light: "Sip water between sets.",
  moderate: "Keep your bottle handy.",
  solid: "Drink steadily to keep up.",
  hard: "Hydrate well — you're working hard.",
  brutal: "Drink up — you're sweating hard.",
};

/** Recommended hydration so far, derived from accumulated effort. */
export function readHydration(effort: EffortReading): HydrationReading {
  const ml = Math.round((effort.points * ML_PER_EFFORT_POINT) / 50) * 50;
  return {
    ml,
    liters: Math.round(ml / 100) / 10,
    glasses: Math.round(ml / ML_PER_GLASS),
    note: HYDRATION_NOTES[effort.tier],
  };
}

export interface LifetimeEffort {
  /** Sessions that have at least one logged set. */
  sessions: number;
  /** Effort points pooled across every session. */
  points: number;
  /** Per-muscle work pooled across every session, busiest first. */
  muscles: MuscleWork[];
  /** Total recommended fluid across every session, ml. */
  hydrationMl: number;
  /** Total recovery protein across every session, g. */
  proteinG: number;
}

/**
 * The session-summary stats (effort, per-muscle work, hydration, protein) rolled
 * up over every logged session. Hydration and protein are summed per session so
 * the totals reflect what each individual session called for, then pooled.
 */
export function lifetimeEffort(sessions: TrainingSession[]): LifetimeEffort {
  const logged = sessions.filter((s) => s.exercises.some((ex) => ex.sets.length > 0));
  let points = 0;
  let hydrationMl = 0;
  let proteinG = 0;
  for (const session of logged) {
    const effort = readEffort(session, sessions);
    points += effort.points;
    hydrationMl += readHydration(effort).ml;
    proteinG += estimateProteinG(effort, muscleBreakdown(session).length);
  }
  return {
    sessions: logged.length,
    points: Math.round(points * 10) / 10,
    muscles: accumulateMuscleWork(logged),
    hydrationMl,
    proteinG,
  };
}
