import { epley1RM, exerciseKey, type ExerciseKey } from "./stats";
import { isCardio, type Equipment, type TrainingSession, type WorkSet } from "./types";
import { round2 } from "./util";

/**
 * Personal records and training streaks — pure derivations over the logged
 * history. PR detection compares a just-logged set against every prior set of
 * the same movement; the streak counts consecutive calendar weeks with at least
 * one logged session.
 */

export type PrKind = "weight" | "reps" | "e1rm";

export interface PrHit {
  kind: PrKind;
  /** The record value: kg for "weight"/"e1rm", reps for "reps". */
  value: number;
  /** The best prior value it beat (0 when this is the first ever). */
  previous: number;
}

/**
 * Which records a new set breaks for its movement, given all sets logged before
 * it. A weight PR is the heaviest load ever handled; a reps PR is the most reps
 * at (or above) the set's load; an e1RM PR is the best Epley estimate. Empty for
 * cardio bouts and unloaded sets with no rep history to beat. Warm-up sets are
 * out on both ends — they neither break records nor set the bar to beat.
 */
export function detectPrs(
  allPriorSets: readonly WorkSet[],
  set: WorkSet,
  equipment: Equipment,
): PrHit[] {
  if (isCardio(equipment) || set.setType === "warmup") return [];
  const priorSets = allPriorSets.filter((s) => s.setType !== "warmup");
  if (priorSets.length === 0) return [];
  const hits: PrHit[] = [];

  if (set.weightKg > 0) {
    const bestWeight = Math.max(...priorSets.map((s) => s.weightKg));
    if (set.weightKg > bestWeight) {
      hits.push({ kind: "weight", value: round2(set.weightKg), previous: round2(bestWeight) });
    }
    const bestE1rm = Math.max(...priorSets.map((s) => epley1RM(s)));
    const e1rm = epley1RM(set);
    if (e1rm > bestE1rm) {
      hits.push({ kind: "e1rm", value: round2(e1rm), previous: round2(bestE1rm) });
    }
  }

  // Most reps at this load or heavier — meaningful for bodyweight work too.
  const atLoad = priorSets.filter((s) => s.weightKg >= set.weightKg);
  if (atLoad.length > 0 && set.reps > 0) {
    const bestReps = Math.max(...atLoad.map((s) => s.reps));
    if (set.reps > bestReps) {
      hits.push({ kind: "reps", value: set.reps, previous: bestReps });
    }
  }

  return hits;
}

/** Every set previously logged for a movement, across the given sessions. */
export function priorSetsFor(
  sessions: readonly TrainingSession[],
  key: ExerciseKey,
): WorkSet[] {
  const out: WorkSet[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (exerciseKey(ex) === key) out.push(...ex.sets);
    }
  }
  return out;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Start (ms) of the Monday 00:00 local week containing `at`. */
function weekStart(at: Date): number {
  const d = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return d.getTime() - dow * 24 * 60 * 60 * 1000;
}

/**
 * Consecutive calendar weeks (Mondays, local time) with at least one logged
 * session, counting back from the current week. The current week counts when it
 * has a session; an empty current week doesn't break the streak — it just isn't
 * counted yet. 0 when even the previous week is empty.
 */
export function weeklyStreak(sessions: readonly TrainingSession[], now: Date = new Date()): number {
  const weeks = new Set<number>();
  for (const s of sessions) {
    const at = new Date(s.startedAt);
    if (!Number.isNaN(at.getTime())) weeks.add(weekStart(at));
  }
  const thisWeek = weekStart(now);
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK_MS;
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor -= WEEK_MS;
  }
  return streak;
}
