import { findMovement } from "./movements";
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  type Equipment,
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

/** Best logged and estimated 1-rep max across the given scope. */
export function bestOneRm(sessions: TrainingSession[], filter: ProgressFilter): BestOneRm {
  let logged = 0;
  let estimated = 0;
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (filter !== "all" && exerciseKey(ex) !== filter) continue;
      if (ex.oneRmKg !== undefined) logged = Math.max(logged, ex.oneRmKg);
      for (const s of ex.sets) estimated = Math.max(estimated, epley1RM(s));
    }
  }
  return { logged: round2(logged), estimated: round2(estimated) };
}

function matchingSets(session: TrainingSession, filter: ProgressFilter): WorkSet[] {
  const out: WorkSet[] = [];
  for (const ex of session.exercises) {
    if (filter !== "all" && exerciseKey(ex) !== filter) continue;
    out.push(...ex.sets);
  }
  return out;
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
    const sets = matchingSets(session, filter);
    if (sets.length === 0) continue;

    let reps = 0;
    let topWeight = 0;
    let volume = 0;
    let strength = 0;
    let hypertrophy = 0;

    for (const s of sets) {
      reps += s.reps;
      topWeight = Math.max(topWeight, s.weightKg);
      volume += s.reps * s.weightKg;
      strength = Math.max(strength, epley1RM(s));
      if (s.reps >= HYPERTROPHY_MIN_REPS && s.reps <= HYPERTROPHY_MAX_REPS) {
        hypertrophy += s.reps * s.weightKg;
      }
    }

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
