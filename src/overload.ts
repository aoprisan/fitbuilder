import { exerciseKey, type ExerciseKey } from "./stats";
import { isBodyweight, isCardio, type Equipment, type TrainingSession, type WorkSet } from "./types";
import { round2 } from "./util";

/**
 * Progressive-overload nudges — "what should I try this time?" for one movement,
 * derived from its logged history. Pure double progression, the most defensible
 * default: work reps up at a load until the top of the rep window, then add the
 * smallest sensible increment and drop back down. RIR sharpens the call when
 * it was logged (a set finished with plenty in the tank is ready to move up
 * sooner); without it the rules behave exactly as classic double progression.
 */

/** Top of the rep window — reaching it at a load earns a weight bump. */
const REP_CEILING = 12;
/** With this many reps in reserve the load is clearly ready to move up early. */
const EASY_RIR = 3;
/** Reps to settle back to after a weight bump (never below the floor). */
const REP_FLOOR = 6;

/** Smallest practical load increment by gear — dumbbells usually step in 2 kg. */
export function loadIncrementKg(equipment: Equipment): number {
  return equipment === "dumbbell" || equipment === "kettlebell" ? 2 : 2.5;
}

export interface OverloadSuggestion {
  /** What moved: add load, add a rep, or simply match last time. */
  kind: "load" | "reps" | "hold";
  /** Suggested load for the top sets, kg (added load for bodyweight gear). */
  weightKg: number;
  /** Suggested reps for the top sets. */
  reps: number;
  /** Signed deltas vs the last session's top set — for the "+2.5 kg" read. */
  deltaKg: number;
  deltaReps: number;
}

/** The heaviest set of a performance, breaking ties by reps. */
function topSet(sets: readonly WorkSet[]): WorkSet | null {
  let best: WorkSet | null = null;
  for (const s of sets) {
    if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) {
      best = s;
    }
  }
  return best;
}

/**
 * Suggest the next step for a movement from its history (newest decided by
 * `startedAt`). Null when the movement has never been logged or is cardio —
 * there's nothing to progress from.
 */
export function suggestOverload(
  sessions: readonly TrainingSession[],
  key: ExerciseKey,
  equipment: Equipment,
): OverloadSuggestion | null {
  if (isCardio(equipment)) return null;

  // Per-session top sets for this movement, chronological.
  const history: { date: string; top: WorkSet }[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (exerciseKey(ex) !== key || ex.sets.length === 0) continue;
      const top = topSet(ex.sets);
      if (top) history.push({ date: s.startedAt, top });
    }
  }
  if (history.length === 0) return null;
  history.sort((a, b) => a.date.localeCompare(b.date));

  const last = history[history.length - 1]!.top;
  const prev = history.length > 1 ? history[history.length - 2]!.top : null;
  const inc = loadIncrementKg(equipment);
  const bodyweightOnly = isBodyweight(equipment) && last.weightKg === 0;

  const suggest = (kind: OverloadSuggestion["kind"], weightKg: number, reps: number): OverloadSuggestion => ({
    kind,
    weightKg: round2(weightKg),
    reps,
    deltaKg: round2(weightKg - last.weightKg),
    deltaReps: reps - last.reps,
  });

  // Bodyweight with no added load: progress by reps only.
  if (bodyweightOnly) {
    return suggest("reps", 0, last.reps + 1);
  }

  // Hit the top of the rep window — or finished clearly fresh — move the load up.
  const fresh = last.rir !== undefined && last.rir >= EASY_RIR && last.reps >= REP_FLOOR;
  if (last.reps >= REP_CEILING || fresh) {
    return suggest("load", last.weightKg + inc, Math.max(REP_FLOOR, last.reps - 2));
  }

  // Same load as the previous session without losing reps: earn one more rep.
  if (!prev || (prev.weightKg === last.weightKg && last.reps >= prev.reps)) {
    return suggest("reps", last.weightKg, last.reps + 1);
  }

  // Load went up recently or reps dipped — consolidate by matching last time.
  return suggest("hold", last.weightKg, last.reps);
}
