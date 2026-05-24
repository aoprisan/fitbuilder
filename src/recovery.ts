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
