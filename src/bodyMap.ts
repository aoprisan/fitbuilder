import { stimulusProximity } from "./effort";
import { SECONDARY_MUSCLE_SHARE } from "./movements";
import { muscleRecovery, recoveryColor } from "./recovery";
import {
  strengthScore,
  volumeStimulus,
  WEEKLY_PRODUCTIVE_MAX,
  weeklyMuscleVolume,
} from "./stats";
import { isCardio, MUSCLE_GROUPS, type LoggedExercise, type MuscleGroup, type TrainingSession } from "./types";
import { clamp, round2 } from "./util";

/**
 * Body-map analytics — the data behind the rotatable muscle figure.
 *
 * Every toggle reduces the logged history to a single 0..1 score *per muscle*
 * (or `null` when that metric has no data for the muscle), which the view paints
 * onto the 3D body as a colour. The four reads are deliberately built from the
 * existing, calibrated analytics so the body map stays consistent with the Stats,
 * Weekly-volume and Recovery screens rather than inventing parallel numbers:
 *
 *  - strength    → relative best estimated 1-rep max (`strengthScore`), normalised
 *                  to the strongest muscle.
 *  - hypertrophy → this week's growth stimulus (`weeklyMuscleVolume.stimulus`).
 *  - fatigue     → 1 − recovery (`muscleRecovery`), so red = just-trained.
 *  - efficiency  → growth banked per hard set: proximity-to-failure quality × how
 *                  well the weekly dose sits in the productive band.
 *
 * This module is intentionally free of any 3D/Three.js code so it can be unit-
 * reasoned and reused; the view turns these scores into colours.
 */

export type BodyMetric = "strength" | "hypertrophy" | "fatigue" | "efficiency";

export const BODY_METRICS: readonly BodyMetric[] = [
  "strength",
  "hypertrophy",
  "fatigue",
  "efficiency",
] as const;

/** English labels (the i18n keys) for the metric toggle. */
export const BODY_METRIC_LABELS: Record<BodyMetric, string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  fatigue: "Fatigue",
  efficiency: "Efficiency",
};

/** `cardio` is a training category, not a body region — left off the figure. */
export const BODY_MUSCLES: readonly MuscleGroup[] = MUSCLE_GROUPS.filter((m) => m !== "cardio");

/** One muscle's reading for the active metric. */
export interface MuscleScore {
  /** 0..1 intensity for the colour ramp, or null when the metric has no data here. */
  value: number | null;
  /** Short human read shown when the muscle is selected, e.g. "82 kg est. 1RM". */
  detail: string;
}

/** A lift counts as compound — and feeds secondary muscles — when it lists any. */
function isCompound(ex: LoggedExercise): boolean {
  return (ex.secondaryMuscles?.length ?? 0) > 0;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ strength */

/**
 * Best estimated 1-rep max per muscle (its strongest logged set as primary
 * mover), plus the peak across muscles used to normalise the map. Bodyweight-only
 * work scores 0 and reads as "no data" rather than weakness.
 */
function strengthByMuscle(sessions: readonly TrainingSession[]): {
  best: Map<MuscleGroup, number>;
  peak: number;
} {
  const best = new Map<MuscleGroup, number>();
  let peak = 0;
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (isCardio(ex.equipment)) continue;
      const compound = isCompound(ex);
      for (const s of ex.sets) {
        const score = strengthScore(s, ex.equipment, compound);
        if (score <= 0) continue;
        const prev = best.get(ex.muscle) ?? 0;
        if (score > prev) best.set(ex.muscle, score);
        if (score > peak) peak = score;
      }
    }
  }
  return { best, peak };
}

/* ------------------------------------------------------ efficiency (7 days) */

/** Raw vs. proximity-weighted (effective) hard sets per muscle in the trailing week. */
interface SetQuality {
  raw: number;
  eff: number;
}

/**
 * Trailing-7-day set quality per muscle: `raw` counts each set fully, `eff`
 * weights it by proximity to failure (junk volume counts as a fraction). Mirrors
 * the crediting in {@link weeklyMuscleVolume} (primary full, secondary share) but
 * tracks both totals so efficiency can read how much of the work was effective.
 * Cardio is skipped — it isn't a hypertrophy target.
 */
function trailingSetQuality(
  sessions: readonly TrainingSession[],
  now: Date,
): Map<MuscleGroup, SetQuality> {
  const cutoff = now.getTime() - WEEK_MS;
  const nowMs = now.getTime();
  const map = new Map<MuscleGroup, SetQuality>();
  const credit = (muscle: MuscleGroup, raw: number, eff: number): void => {
    const e = map.get(muscle) ?? { raw: 0, eff: 0 };
    e.raw += raw;
    e.eff += eff;
    map.set(muscle, e);
  };
  for (const session of sessions) {
    const at = new Date(session.startedAt).getTime();
    if (Number.isNaN(at) || at < cutoff || at > nowMs) continue;
    for (const ex of session.exercises) {
      if (isCardio(ex.equipment)) continue;
      for (const s of ex.sets) {
        const q = stimulusProximity(s.rir);
        credit(ex.muscle, 1, q);
        for (const sec of ex.secondaryMuscles ?? [])
          credit(sec, SECONDARY_MUSCLE_SHARE, q * SECONDARY_MUSCLE_SHARE);
      }
    }
  }
  return map;
}

// The most stimulus a week of hard sets can practically attain — the productive
// ceiling — used to normalise the per-muscle dose so "efficient" peaks in band.
const DOSE_REFERENCE = volumeStimulus(WEEKLY_PRODUCTIVE_MAX);

/**
 * Training efficiency for one muscle (0..1), or null when it wasn't trained this
 * week. Two factors compound:
 *  - proximity quality — effective ÷ raw sets: sets taken near failure bank their
 *    full stimulus, junk volume far from failure counts as a fraction.
 *  - dose quality — how close the effective weekly volume gets to the productive
 *    ceiling, with an overshoot penalty so volume piled past the point of
 *    diminishing returns reads as wasted effort, not extra credit.
 */
function efficiencyScore(q: SetQuality | undefined): MuscleScore {
  if (q === undefined || q.raw <= 0) return { value: null, detail: "Not trained this week" };
  const proximityQuality = q.eff / q.raw; // 0.4..1
  const dose = clamp(volumeStimulus(q.eff) / DOSE_REFERENCE, 0, 1);
  const overshoot = q.eff > WEEKLY_PRODUCTIVE_MAX ? WEEKLY_PRODUCTIVE_MAX / q.eff : 1;
  const value = clamp(proximityQuality * dose * overshoot, 0, 1);
  return {
    value,
    detail: `${round2(q.eff)} effective sets · ${Math.round(proximityQuality * 100)}% near failure`,
  };
}

/* --------------------------------------------------------------- assembly */

/**
 * Per-muscle scores for the chosen metric. Returns a full map over
 * {@link BODY_MUSCLES} (cardio excluded), each entry a 0..1 value or null when
 * the metric has nothing to show for that muscle.
 */
export function muscleScores(
  metric: BodyMetric,
  sessions: readonly TrainingSession[],
  now: Date = new Date(),
): Map<MuscleGroup, MuscleScore> {
  const out = new Map<MuscleGroup, MuscleScore>();

  if (metric === "strength") {
    const { best, peak } = strengthByMuscle(sessions);
    for (const muscle of BODY_MUSCLES) {
      const score = best.get(muscle) ?? 0;
      out.set(
        muscle,
        score > 0 && peak > 0
          ? { value: clamp(score / peak, 0, 1), detail: `≈ ${round2(score)} kg est. 1RM` }
          : { value: null, detail: "No loaded sets logged" },
      );
    }
    return out;
  }

  if (metric === "hypertrophy") {
    const weekly = new Map(weeklyMuscleVolume([...sessions], now).map((v) => [v.muscle, v]));
    for (const muscle of BODY_MUSCLES) {
      const v = weekly.get(muscle);
      const sets = v?.sets ?? 0;
      out.set(muscle, {
        value: v ? v.stimulus : 0,
        detail:
          sets > 0
            ? `${sets} hard ${sets === 1 ? "set" : "sets"} this week`
            : "No volume this week",
      });
    }
    return out;
  }

  if (metric === "fatigue") {
    const recovery = new Map(muscleRecovery([...sessions], now).map((r) => [r.muscle, r]));
    for (const muscle of BODY_MUSCLES) {
      const r = recovery.get(muscle);
      if (!r || r.lastTrainedAt === null) {
        out.set(muscle, { value: 0, detail: "Fresh — not trained recently" });
        continue;
      }
      const fatigue = clamp(1 - r.recovered, 0, 1);
      out.set(muscle, {
        value: fatigue,
        detail:
          r.recovered >= 1
            ? "Recovered"
            : `~${r.hoursRemaining}h to recover`,
      });
    }
    return out;
  }

  // efficiency
  const quality = trailingSetQuality(sessions, now);
  for (const muscle of BODY_MUSCLES) out.set(muscle, efficiencyScore(quality.get(muscle)));
  return out;
}

/* ------------------------------------------------------------------ colour */

type Rgb = readonly [number, number, number];

const NO_DATA: Rgb = [0x9a, 0x94, 0x8a]; // muted stone — metric has nothing here

// Per-metric ramps. Strength/Hypertrophy run from a pale wash to a saturated
// theme ink (deeper = more); Fatigue and Efficiency reuse the red→amber→green
// recovery ramp (fatigue inverted so red = fatigued).
const STRENGTH_LO: Rgb = [0xc7, 0xd2, 0xe0];
const STRENGTH_HI: Rgb = [0x2c, 0x3e, 0x57]; // --navy
const HYPER_LO: Rgb = [0xe9, 0xdc, 0xbb];
const HYPER_HI: Rgb = [0xc9, 0x96, 0x2a]; // --mustard / ochre

function lerp(from: Rgb, to: Rgb, t: number): string {
  const k = clamp(t, 0, 1);
  const m = (i: 0 | 1 | 2): number => Math.round(from[i] + (to[i] - from[i]) * k);
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

/** Colour for a muscle's score under the given metric (grey when value is null). */
export function metricColor(metric: BodyMetric, value: number | null): string {
  if (value === null) return `rgb(${NO_DATA[0]}, ${NO_DATA[1]}, ${NO_DATA[2]})`;
  switch (metric) {
    case "strength":
      return lerp(STRENGTH_LO, STRENGTH_HI, value);
    case "hypertrophy":
      return lerp(HYPER_LO, HYPER_HI, value);
    case "fatigue":
      return recoveryColor(1 - value); // red = fatigued, green = fresh
    case "efficiency":
      return recoveryColor(value); // green = efficient, red = wasteful
  }
}

export interface MetricLegend {
  /** Label under the low (left) end of the gradient. */
  lowLabel: string;
  /** Label under the high (right) end of the gradient. */
  highLabel: string;
  /** One-line description of what the colour means. */
  desc: string;
}

/** Legend copy (English / i18n keys) for the active metric. */
export const METRIC_LEGEND: Record<BodyMetric, MetricLegend> = {
  strength: {
    lowLabel: "Weaker",
    highLabel: "Stronger",
    desc: "Relative strength per muscle — your best estimated 1-rep max.",
  },
  hypertrophy: {
    lowLabel: "Low",
    highLabel: "High",
    desc: "Growth stimulus from hard-set volume over the last 7 days.",
  },
  fatigue: {
    lowLabel: "Fresh",
    highLabel: "Fatigued",
    desc: "How fatigued each muscle is since you last trained it.",
  },
  efficiency: {
    lowLabel: "Wasteful",
    highLabel: "Efficient",
    desc: "Growth banked per hard set — proximity to failure × dose quality.",
  },
};

/** A CSS `linear-gradient(...)` for the metric's legend bar, sampled across the ramp. */
export function metricGradientCss(metric: BodyMetric): string {
  const stops = [0, 0.25, 0.5, 0.75, 1].map(
    (t) => `${metricColor(metric, t)} ${Math.round(t * 100)}%`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
