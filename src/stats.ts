import { stimulusProximity } from "./effort";
import { effectiveLoadKg, hypertrophyFactor, strengthFactor } from "./loadProfile";
import { findMovement, SECONDARY_MUSCLE_SHARE } from "./movements";
import {
  EQUIPMENT_LABELS,
  isCardio,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
  type WorkSet,
} from "./types";
import { round2 } from "./util";

/**
 * Progress analytics for logged live sessions.
 *
 * Each chartable metric is reduced to one value per session, then ordered
 * chronologically so the views can draw a simple line of progress over time.
 * Metrics are scoped either to every logged set ("all") or to a single
 * exercise (a muscle-group + equipment pairing) for true progressive-overload
 * tracking on one movement.
 */

// Rep window where load most efficiently drives muscle growth: heavy enough to
// matter, high enough in volume to accumulate stimulus. Sets below this read as
// pure strength work; sets above as endurance.
const HYPERTROPHY_MIN_REPS = 6;
const HYPERTROPHY_MAX_REPS = 20;

/** Estimated one-rep max via the Epley formula. Bodyweight-only sets (0 kg) read 0. */
export function epley1RM(set: WorkSet): number {
  if (set.weightKg <= 0) return 0;
  return set.weightKg * (1 + set.reps / 30);
}

/** A lift counts as compound when it taxes secondary muscles. */
function isCompound(ex: LoggedExercise): boolean {
  return (ex.secondaryMuscles?.length ?? 0) > 0;
}

/**
 * Equipment-aware strength proxy: an Epley estimate computed on *effective*
 * load, then scaled by how well the load type and movement transfer to maximal
 * strength. So a 70 kg cable reads as far less strength than a 70 kg bench, and
 * a free-weight compound reads as more than an isolation machine.
 */
export function strengthScore(set: WorkSet, equipment: Equipment, compound: boolean): number {
  const load = effectiveLoadKg(set.weightKg, equipment);
  if (load <= 0) return 0;
  return load * (1 + set.reps / 30) * strengthFactor(equipment, compound);
}

/**
 * Stable identity for "the same exercise" across sessions: the catalog movement
 * id when known, else the legacy "muscle::equipment" pairing (kept so logs made
 * before the exercise catalog still group together).
 */
export type ExerciseKey = string;

export function exerciseKey(ex: {
  muscle: MuscleGroup;
  equipment: Equipment;
  exerciseId?: string;
}): ExerciseKey {
  return ex.exerciseId !== undefined && ex.exerciseId !== ""
    ? ex.exerciseId
    : `${ex.muscle}::${ex.equipment}`;
}

/**
 * Whether an exercise key refers to cardio gear (treadmill/run) — used to switch
 * the Stats view from the strength charts (reps/weight/1RM) to the cardio charts
 * (distance/pace/elevation). Resolves the catalog movement, or the equipment from
 * a legacy "muscle::equipment" key.
 */
export function isCardioExerciseKey(key: ExerciseKey): boolean {
  if (key.includes("::")) {
    const equipment = key.split("::")[1];
    return equipment !== undefined && isCardio(equipment as Equipment);
  }
  const movement = findMovement(key);
  return movement !== undefined && isCardio(movement.equipment);
}

/** Human-readable label for an exercise key, e.g. "Chest · Incline Bench Press". */
export function exerciseKeyLabel(key: ExerciseKey): string {
  if (key.includes("::")) {
    const [muscle, equipment] = key.split("::") as [MuscleGroup, Equipment];
    return `${MUSCLE_LABELS[muscle]} · ${EQUIPMENT_LABELS[equipment]}`;
  }
  const movement = findMovement(key);
  return movement ? `${MUSCLE_LABELS[movement.primaryMuscle]} · ${movement.name}` : key;
}

/** Distinct exercises that have at least one logged set, sorted for stable menus. */
export function presentExerciseKeys(sessions: TrainingSession[]): ExerciseKey[] {
  const keys = new Set<ExerciseKey>();
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (ex.sets.length > 0) keys.add(exerciseKey(ex));
    }
  }
  return [...keys].sort();
}

/** A scope for {@link buildProgress}: every set, or one exercise. */
export type ProgressFilter = ExerciseKey | "all";

/** One session reduced to its chartable metrics. */
export interface ProgressPoint {
  /** ISO timestamp the session started — used for ordering. */
  date: string;
  /** Short x-axis label, e.g. "22 May". */
  label: string;
  /** Total reps logged. */
  reps: number;
  /** Heaviest single-set load, kg (added load for bodyweight gear). */
  topWeight: number;
  /** Combined work: Σ reps × weight, kg — the union of reps and weight. */
  volume: number;
  /** Best estimated 1-rep max, kg — the strength proxy. */
  strength: number;
  /** Volume from sets in the 6–20 rep range, kg — the hypertrophy proxy. */
  hypertrophy: number;
}

/** Best 1-rep max for a scope: the logged tested max alongside the Epley estimate. */
export interface BestOneRm {
  /** Heaviest logged tested max across matching exercises, kg; 0 when none. */
  logged: number;
  /** Heaviest estimated 1RM (Epley) across matching sets, kg; 0 when none. */
  estimated: number;
}

/**
 * Best logged and estimated 1-rep max across the given scope. `loggedMaxes` are
 * standalone tested maxes recorded outside a workout (keyed by {@link ExerciseKey});
 * they're folded in alongside any max still carried on a logged exercise.
 */
export function bestOneRm(
  sessions: TrainingSession[],
  filter: ProgressFilter,
  loggedMaxes: Record<ExerciseKey, number> = {},
): BestOneRm {
  let logged = 0;
  let estimated = 0;
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (filter !== "all" && exerciseKey(ex) !== filter) continue;
      if (ex.oneRmKg !== undefined) logged = Math.max(logged, ex.oneRmKg);
      const compound = isCompound(ex);
      for (const s of ex.sets) estimated = Math.max(estimated, strengthScore(s, ex.equipment, compound));
    }
  }
  for (const [key, kg] of Object.entries(loggedMaxes)) {
    if (filter !== "all" && key !== filter) continue;
    logged = Math.max(logged, kg);
  }
  return { logged: round2(logged), estimated: round2(estimated) };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Build the chronological progress series for the given scope. */
export function buildProgress(
  sessions: TrainingSession[],
  filter: ProgressFilter,
): ProgressPoint[] {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const points: ProgressPoint[] = [];

  for (const session of ordered) {
    let setCount = 0;
    let reps = 0;
    let topWeight = 0;
    let volume = 0;
    let strength = 0;
    let hypertrophy = 0;

    for (const ex of session.exercises) {
      if (filter !== "all" && exerciseKey(ex) !== filter) continue;
      const eq = ex.equipment;
      const compound = isCompound(ex);
      const growthFactor = hypertrophyFactor(eq);
      for (const s of ex.sets) {
        setCount += 1;
        reps += s.reps;
        topWeight = Math.max(topWeight, s.weightKg); // raw: the heaviest load actually handled
        const eff = effectiveLoadKg(s.weightKg, eq);
        volume += s.reps * eff;
        strength = Math.max(strength, strengthScore(s, eq, compound));
        if (s.reps >= HYPERTROPHY_MIN_REPS && s.reps <= HYPERTROPHY_MAX_REPS) {
          // Effective reps: volume stopped far from failure stimulates less growth.
          hypertrophy += s.reps * eff * growthFactor * stimulusProximity(s.rir);
        }
      }
    }

    if (setCount === 0) continue;

    points.push({
      date: session.startedAt,
      label: shortDate(session.startedAt),
      reps,
      topWeight: round2(topWeight),
      volume: Math.round(volume),
      strength: round2(strength),
      hypertrophy: Math.round(hypertrophy),
    });
  }

  return points;
}

/* =============================================================================
   Cardio progress — distance, pace, time and climb per session. Cardio sets
   carry no reps or load, so the strength series above read flat zero for them;
   this is the parallel read the Stats view shows when the scope is a cardio
   exercise (e.g. the treadmill).
   ========================================================================== */

/** One session reduced to its chartable cardio metrics. */
export interface CardioPoint {
  /** ISO timestamp the session started — used for ordering. */
  date: string;
  /** Short x-axis label, e.g. "22 May". */
  label: string;
  /** Total distance covered, km. */
  distanceKm: number;
  /** Total moving time across the cardio sets, seconds. */
  durationSec: number;
  /** Average speed, km/h — distance ÷ moving time (0 when time is unknown). */
  speedKmh: number;
  /** Pace, seconds per km — the inverse read of speed (0 when distance is unknown). */
  paceSecPerKm: number;
  /** Vertical climb from incline × distance, metres. */
  climbM: number;
}

/**
 * Chronological cardio progress for the given scope. Sets are summed per session
 * (distance, time, climb); speed and pace are derived from the session totals so
 * a session of mixed-speed bouts reads as its true average. Sessions with no
 * cardio work in scope are skipped, mirroring {@link buildProgress}.
 */
export function buildCardioProgress(
  sessions: TrainingSession[],
  filter: ProgressFilter,
): CardioPoint[] {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const points: CardioPoint[] = [];

  for (const session of ordered) {
    let distanceKm = 0;
    let durationSec = 0;
    let climbM = 0;
    let any = false;

    for (const ex of session.exercises) {
      if (!isCardio(ex.equipment)) continue;
      if (filter !== "all" && exerciseKey(ex) !== filter) continue;
      for (const s of ex.sets) {
        any = true;
        const dist = Math.max(0, s.distanceKm ?? 0);
        distanceKm += dist;
        durationSec += s.durationSec ?? 0;
        climbM += dist * 1000 * (Math.max(0, s.inclinePct ?? 0) / 100);
      }
    }

    if (!any) continue;

    const hours = durationSec / 3600;
    points.push({
      date: session.startedAt,
      label: shortDate(session.startedAt),
      distanceKm: round2(distanceKm),
      durationSec: Math.round(durationSec),
      speedKmh: hours > 0 ? round2(distanceKm / hours) : 0,
      paceSecPerKm: distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0,
      climbM: Math.round(climbM),
    });
  }

  return points;
}

/* =============================================================================
   Weekly volume per muscle — the dose unit hypertrophy research is built on.
   The dose-response is *per muscle, per week*: growth is reliably productive at
   roughly 10–20 hard sets, with a minimum effective dose near ~6 and clearly
   diminishing returns past ~20 (each added set returns less — the final
   increments of growth need several times the volume of the first). Surfaced
   over a trailing 7-day window so it reads as "what each muscle got this week".
   ========================================================================== */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Evidence-based weekly hard-set landmarks per muscle group. */
export const WEEKLY_MAINTENANCE_SETS = 6;
export const WEEKLY_PRODUCTIVE_MIN = 10;
export const WEEKLY_PRODUCTIVE_MAX = 20;

export type VolumeBand = "none" | "under" | "maintenance" | "productive" | "high";

/** Bucket a weekly set count against the dose-response landmarks. */
export function classifyWeeklyVolume(sets: number): VolumeBand {
  if (sets <= 0) return "none";
  if (sets < WEEKLY_MAINTENANCE_SETS) return "under";
  if (sets < WEEKLY_PRODUCTIVE_MIN) return "maintenance";
  if (sets <= WEEKLY_PRODUCTIVE_MAX) return "productive";
  return "high";
}

/**
 * Concave marginal-value of a week's volume, 0..1: the first sets buy the most
 * growth and later ones progressively less (~63% of attainable stimulus by 8
 * sets, ~86% by 16, ~95% by 24). A simple stand-in for the diminishing
 * dose-response curve, not a literal percentage of gains.
 */
export function volumeStimulus(sets: number): number {
  return 1 - Math.exp(-Math.max(0, sets) / 8);
}

export interface MuscleWeeklyVolume {
  muscle: MuscleGroup;
  /** Effective hard working sets this muscle received in the trailing 7 days. */
  sets: number;
  band: VolumeBand;
  /** Concave marginal-value of that volume, 0..1. */
  stimulus: number;
}

/**
 * Effective weekly hard sets per muscle over the trailing 7 days, busiest first.
 * Each logged set credits its primary muscle a full set and each secondary a
 * {@link SECONDARY_MUSCLE_SHARE}, scaled by proximity to failure so sets stopped
 * well short of failure count as fractional (junk) volume rather than full sets.
 */
export function weeklyMuscleVolume(
  sessions: TrainingSession[],
  now: Date = new Date(),
): MuscleWeeklyVolume[] {
  const nowMs = now.getTime();
  const cutoff = nowMs - WEEK_MS;
  const sets = new Map<MuscleGroup, number>();
  const credit = (muscle: MuscleGroup, amount: number): void => {
    sets.set(muscle, (sets.get(muscle) ?? 0) + amount);
  };

  for (const session of sessions) {
    const at = new Date(session.startedAt).getTime();
    if (Number.isNaN(at) || at < cutoff || at > nowMs) continue;
    for (const ex of session.exercises) {
      // Cardio isn't hypertrophy volume — a treadmill bout is no "hard set", so
      // it never credits the weekly dose-response board.
      if (isCardio(ex.equipment)) continue;
      for (const s of ex.sets) {
        const hardSet = stimulusProximity(s.rir); // a full near-failure set = 1
        credit(ex.muscle, hardSet);
        for (const sec of ex.secondaryMuscles ?? []) credit(sec, hardSet * SECONDARY_MUSCLE_SHARE);
      }
    }
  }

  // `cardio` is a training category, not a hypertrophy target, so it's left off
  // the sets-per-muscle board entirely (it carries no credited volume anyway).
  return MUSCLE_GROUPS.filter((muscle) => muscle !== "cardio").map(
    (muscle): MuscleWeeklyVolume => {
      const n = round2(sets.get(muscle) ?? 0);
      return { muscle, sets: n, band: classifyWeeklyVolume(n), stimulus: volumeStimulus(n) };
    },
  ).sort((a, b) => b.sets - a.sets);
}
