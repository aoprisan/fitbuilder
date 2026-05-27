import { effectiveLoadKg } from "./loadProfile";
import { SECONDARY_MUSCLE_SHARE } from "./movements";
import type { Equipment, MuscleGroup, TrainingSession, WorkSet } from "./types";
import { clamp } from "./util";

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

/**
 * Proximity-to-failure weighting from a set's reps-in-reserve (RIR).
 *
 * Proximity to failure is the single strongest per-set driver of both growth
 * stimulus and fatigue, so the two effects are modelled separately:
 *
 *  - {@link stimulusProximity} — growth stimulus / "effective reps". Reps far
 *    from failure are mostly junk volume, so the credit plateaus near failure
 *    (RIR 0–2 ≈ full) and falls off as more reps are left in reserve.
 *  - {@link fatigueProximity} — fatigue, recovery demand and how hard a session
 *    *felt*. Training to failure costs disproportionately more, so this runs
 *    above 1 at failure and below 1 when sets stop well short.
 *
 * Both return 1 when RIR is absent: an untracked set is treated as a typical
 * hard working set (≈1.5 RIR), so logs without RIR behave exactly as before.
 */
export function stimulusProximity(rir?: number): number {
  if (rir === undefined) return 1;
  // Flat until ~2 RIR (effective reps), then a linear decline to a 0.4 floor.
  return clamp(1 - 0.11 * Math.max(0, rir - 2), 0.4, 1);
}

export function fatigueProximity(rir?: number): number {
  if (rir === undefined) return 1;
  // Centred so the untracked baseline (1.0) lands at ~1.5 RIR; failure costs more.
  return clamp(1.15 - 0.1 * rir, 0.6, 1.2);
}

/**
 * Effort points contributed by a single logged set. The volume term is driven
 * by *effective* load (see {@link effectiveLoadKg}), so cable / leverage-machine
 * work — whose stack number overstates the real resistance — contributes less
 * than the same indicated kg on a free weight, while its reps and time under
 * tension still count in full.
 */
export function setEffort(set: WorkSet, equipment?: Equipment): number {
  const load = equipment ? effectiveLoadKg(set.weightKg, equipment) : Math.max(0, set.weightKg);
  const volume = set.reps * load;
  const duration = set.durationSec ?? 0;
  return (
    1 +
    set.reps / REPS_PER_POINT +
    volume / VOLUME_PER_POINT +
    duration / SECONDS_PER_POINT
  );
}

/** Accumulated effort points across every logged set in a session — work done. */
export function sessionEffort(session: TrainingSession): number {
  let total = 0;
  for (const ex of session.exercises) {
    for (const s of ex.sets) total += setEffort(s, ex.equipment);
  }
  return total;
}

/**
 * Session effort weighted by proximity to failure — the basis for the
 * easy/hard reading. Sets pushed to failure read harder and sets stopped well
 * short read easier; with no RIR logged this equals {@link sessionEffort}.
 */
function sessionEffortIntensity(session: TrainingSession): number {
  let total = 0;
  for (const ex of session.exercises) {
    for (const s of ex.sets) total += setEffort(s, ex.equipment) * fatigueProximity(s.rir);
  }
  return total;
}

/** Median of a per-session measure across prior sessions (the active one excluded). */
function medianSessionMeasure(
  history: TrainingSession[],
  excludeId: string | undefined,
  measure: (session: TrainingSession) => number,
): number {
  const values = history
    .filter((s) => s.id !== excludeId)
    .map(measure)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * Median effort of the user's prior sessions, used to calibrate the gauge.
 * The active session is excluded so it never anchors against itself. Returns 0
 * when there's no usable history.
 */
export function typicalEffort(history: TrainingSession[], excludeId?: string): number {
  return medianSessionMeasure(history, excludeId, sessionEffort);
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
  /** Raw accumulated effort points (work done) — drives hydration, calories, protein. */
  points: number;
  /** Gauge fill, current *intensity-weighted* effort ÷ target (can exceed 1). */
  ratio: number;
  tier: EffortTier;
  label: string;
  /** Intensity-weighted effort as a % of the user's typical session, or null with no history. */
  vsTypicalPct: number | null;
}

/**
 * Read the current effort gauge for a session, calibrated against history.
 *
 * The easy/hard *tier* and gauge fill run off proximity-to-failure-weighted
 * effort (a hard, near-failure session reads higher than an easy one of equal
 * tonnage), while {@link EffortReading.points} stays raw work so the downstream
 * hydration / calorie / protein estimates track energy expended, not intensity.
 * With no RIR logged the two coincide, so the gauge is unchanged for older logs.
 */
export function readEffort(session: TrainingSession, history: TrainingSession[]): EffortReading {
  const points = sessionEffort(session);
  const intensity = sessionEffortIntensity(session);
  const typical = medianSessionMeasure(history, session.id, sessionEffortIntensity);
  const target = typical > 0 ? typical : FULL_SESSION_EFFORT;
  const ratio = intensity / target;
  const { tier, label } = TIERS.find((t) => ratio >= t.min) ?? TIERS[TIERS.length - 1]!;
  return {
    points,
    ratio,
    tier,
    label,
    vsTypicalPct: typical > 0 ? Math.round((intensity / typical) * 100) : null,
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
  const credit = (
    muscle: MuscleGroup,
    set: WorkSet,
    share: number,
    equipment: Equipment,
  ): void => {
    const entry =
      byMuscle.get(muscle) ?? { muscle, volume: 0, timeSec: 0, sets: 0, effort: 0 };
    entry.volume += set.reps * Math.max(0, set.weightKg) * share;
    entry.timeSec += (set.durationSec ?? 0) * share;
    entry.sets += 1;
    entry.effort += setEffort(set, equipment) * share;
    byMuscle.set(muscle, entry);
  };
  for (const session of sessions) {
    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        // Primary muscle takes full credit; a compound lift's secondary muscles
        // each take a fixed share so they register as worked in the breakdown.
        credit(ex.muscle, s, 1, ex.equipment);
        for (const sec of ex.secondaryMuscles ?? [])
          credit(sec, s, SECONDARY_MUSCLE_SHARE, ex.equipment);
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

// Rough energy a session burns, drawn from the same effort points that drive
// hydration. Tuned so a full session (~45 pts) lands near ~225 kcal of
// exercise-attributable burn for an average lifter; a brutal one near ~300.
// Resistance training with normal rest periods averages ~3.5 METs, so this is
// a deliberately conservative ballpark (trackers tend to overestimate).
const KCAL_PER_EFFORT_POINT = 5;

/** Rough calories burned in a session, from accumulated effort. Rounded to 10. */
export function estimateCalories(effort: EffortReading): number {
  return Math.round((effort.points * KCAL_PER_EFFORT_POINT) / 10) * 10;
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
  /** Rough total calories burned across every session, kcal. */
  caloriesKcal: number;
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
  let caloriesKcal = 0;
  for (const session of logged) {
    const effort = readEffort(session, sessions);
    points += effort.points;
    hydrationMl += readHydration(effort).ml;
    proteinG += estimateProteinG(effort, muscleBreakdown(session).length);
    caloriesKcal += estimateCalories(effort);
  }
  return {
    sessions: logged.length,
    points: Math.round(points * 10) / 10,
    muscles: accumulateMuscleWork(logged),
    hydrationMl,
    proteinG,
    caloriesKcal,
  };
}
