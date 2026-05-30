import type { MuscleGroup, WorkSet } from "./types";

/**
 * Shared model for how a treadmill / running bout loads the lower body.
 *
 * Running is a real but low-efficiency leg stimulus, so a cardio bout is treated
 * as a *fraction* of a lower-body bout rather than a hard set. The same dose
 * feeds two separate reads — weekly hypertrophy volume (`stats.ts`) and per-muscle
 * recovery (`recovery.ts`) — so the two never drift apart. Crucially it's driven
 * by a small, bout-dosed figure, NOT cardio's large distance-based effort, so the
 * legs read as light-to-moderate work, not a brutal leg day.
 */

/** Lower-body muscles a bout works, each with its share of one full leg bout. */
export const CARDIO_LEG_MUSCLES: ReadonlyArray<{ muscle: MuscleGroup; share: number }> = [
  { muscle: "legs", share: 0.5 },
  { muscle: "calves", share: 0.5 },
  { muscle: "glutes", share: 0.3 },
];

// A bout this long (or this far) is one full credit unit; shorter counts pro-rata.
const CARDIO_LEG_REF_SEC = 1800;
const CARDIO_LEG_REF_KM = 5;
// Each 1% of incline adds this much — hills shift far more onto the lower body.
const CARDIO_LEG_INCLINE_PER_PCT = 0.04;

/**
 * How much of a "full" lower-body bout one cardio set represents (≈0..1.4): the
 * larger of its time- and distance-based fraction (capped at a single unit so one
 * long bout can't masquerade as a leg session), then lifted by incline. Returns 0
 * for a bout with no measurable time or distance.
 */
export function cardioLegDose(set: WorkSet): number {
  const base = Math.min(
    1,
    Math.max((set.durationSec ?? 0) / CARDIO_LEG_REF_SEC, (set.distanceKm ?? 0) / CARDIO_LEG_REF_KM),
  );
  if (base <= 0) return 0;
  return base * (1 + Math.max(0, set.inclinePct ?? 0) * CARDIO_LEG_INCLINE_PER_PCT);
}
