import { muscleRecovery } from "./recovery";
import { weeklyMuscleVolume, type VolumeBand } from "./stats";
import type { MuscleGroup, TrainingSession } from "./types";

/**
 * "What should I train today?" — ranks muscle groups by combining the two reads
 * the app already keeps: per-muscle recovery (don't suggest what's still sore)
 * and trailing-7-day hard-set volume (favour what's been under-dosed). Pure;
 * the Home card renders the top picks.
 */

/** A muscle below this readiness isn't suggested — it still needs rest. */
const READY_THRESHOLD = 0.75;

export interface TrainTodayPick {
  muscle: MuscleGroup;
  /** Recovery fraction 0..1 (1 = fully recovered / never trained). */
  recovered: number;
  /** Effective hard sets in the trailing 7 days. */
  weeklySets: number;
  band: VolumeBand;
  /** True when the muscle has been trained at least once — picks with history first. */
  trained: boolean;
}

/**
 * Top muscle groups to train today: recovered enough, ordered by how little
 * weekly stimulus they've banked (then by readiness). Untrained-ever groups rank
 * after trained ones — they're a fine suggestion but the user clearly hasn't
 * chosen to train them yet. Empty when nothing has ever been logged.
 */
export function trainTodayPicks(
  sessions: readonly TrainingSession[],
  count = 3,
  now: Date = new Date(),
): TrainTodayPick[] {
  if (!sessions.some((s) => s.exercises.some((ex) => ex.sets.length > 0))) return [];

  const recovery = new Map(muscleRecovery(sessions, now).map((r) => [r.muscle, r]));
  return weeklyMuscleVolume([...sessions], now)
    .map((v): TrainTodayPick => {
      const rec = recovery.get(v.muscle);
      return {
        muscle: v.muscle,
        recovered: rec ? rec.recovered : 1,
        weeklySets: v.sets,
        band: v.band,
        trained: rec?.lastTrainedAt != null,
      };
    })
    .filter((p) => p.recovered >= READY_THRESHOLD)
    .sort(
      (a, b) =>
        Number(b.trained) - Number(a.trained) ||
        a.weeklySets - b.weeklySets ||
        b.recovered - a.recovered,
    )
    .slice(0, count);
}
