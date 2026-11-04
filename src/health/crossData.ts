import { latestBodyweight, todayKey } from "../bodyweightStore";
import {
  estimateCalories,
  estimateProteinG,
  muscleBreakdown,
  readEffort,
  readHydration,
} from "../effort";
import { loadSessions } from "../logStorage";
import type { TrainingSession } from "../types";
import { dayTotals, type Macros } from "./cutModel";
import { loadCut } from "./cutStore";
import { loadWater, waterDay } from "./waterStore";

/**
 * Where the three logs meet. Training, drinks and food are kept in their own
 * stores and shown on their own tabs; these reads join them for one calendar
 * day so each view can show what the others imply:
 *
 *  - Water: the day's sessions add their effort-based fluid estimate to the goal.
 *  - Fuel: the day's sessions add their recovery-protein dose to the protein
 *    target, and show their rough burn (the calorie target stays as set).
 *  - Body / History: water and food logged on a day sit beside its training.
 */

export interface TrainingDay {
  sessions: TrainingSession[];
  /** Effort-based fluid to replace for the day's training, ml. */
  hydrationMl: number;
  /** Rough kcal burned by the day's training. */
  kcal: number;
  /** Recovery-protein estimate for the day's training, g. */
  proteinG: number;
}

/** Sessions started on a local calendar day, with their summed estimates. */
export function trainingOn(date = todayKey(), sessions = loadSessions()): TrainingDay {
  const onDay = sessions.filter((s) => todayKey(new Date(s.startedAt)) === date);
  const bw = latestBodyweight()?.kg;
  let hydrationMl = 0;
  let kcal = 0;
  let proteinG = 0;
  for (const s of onDay) {
    const effort = readEffort(s, sessions);
    if (effort.points <= 0) continue;
    hydrationMl += readHydration(effort).ml;
    kcal += estimateCalories(effort, bw);
    proteinG += estimateProteinG(effort, muscleBreakdown(s).length, bw);
  }
  return { sessions: onDay, hydrationMl, kcal, proteinG };
}

/**
 * A day's targets with its training folded in: the water goal grows by the
 * sessions' fluid estimate and the protein target by their recovery dose. The
 * calorie target is left as set — the burn isn't meant to be eaten back.
 */
export function trainingTargets(
  base: { waterGoalMl: number; proteinG: number },
  training: Pick<TrainingDay, "hydrationMl" | "proteinG">,
): { waterGoalMl: number; proteinG: number } {
  return {
    waterGoalMl: trainingWaterGoal(base.waterGoalMl, training),
    proteinG: base.proteinG + training.proteinG,
  };
}

/** The water goal for a day, with its training fluid added, ml. */
export function trainingWaterGoal(dailyGoalMl: number, training: Pick<TrainingDay, "hydrationMl">): number {
  return dailyGoalMl + training.hydrationMl;
}

export interface DayLedger {
  date: string;
  training: TrainingDay;
  /** Effective hydration logged, ml. */
  hydrationMl: number;
  /** The water goal plus the day's training top-up, ml. */
  waterGoalMl: number;
  food: Macros;
  kcalTarget: number;
  /** The Fuel protein target plus the day's training recovery dose, g. */
  proteinTarget: number;
  /** The protein target as set in Fuel, before training, g. */
  proteinBase: number;
}

/** Drinks, food and training for one day, side by side. */
export function dayLedger(date = todayKey(), sessions = loadSessions()): DayLedger {
  const training = trainingOn(date, sessions);
  const water = loadWater();
  const cut = loadCut();
  const targets = trainingTargets({ waterGoalMl: water.dailyGoalMl, proteinG: cut.settings.protein }, training);
  return {
    date,
    training,
    hydrationMl: waterDay(water.entries, date).hydrationMl,
    waterGoalMl: targets.waterGoalMl,
    food: dayTotals(cut, date),
    kcalTarget: cut.settings.kcal,
    proteinTarget: targets.proteinG,
    proteinBase: cut.settings.protein,
  };
}

/**
 * Hydration, food and weigh-ins on the days of the given sessions, as a
 * Markdown section for the "Analyze with Claude" report — so the analysis can
 * weigh a flat session against a short night of water or a deep deficit.
 * Empty when none of those days has anything logged.
 */
export function healthContextMarkdown(sessions: readonly TrainingSession[]): string {
  const days = [...new Set(sessions.map((s) => todayKey(new Date(s.startedAt))))].sort();
  if (!days.length) return "";
  const water = loadWater();
  const cut = loadCut();
  const all = loadSessions();
  const rows: string[] = [];
  for (const date of days) {
    const w = waterDay(water.entries, date);
    const food = dayTotals(cut, date);
    const kg = cut.weights[date];
    if (w.entries.length === 0 && food.kcal === 0 && kg === undefined) continue;
    const tr = trainingOn(date, all);
    const goals = trainingTargets({ waterGoalMl: water.dailyGoalMl, proteinG: cut.settings.protein }, tr);
    const parts: string[] = [];
    if (w.entries.length)
      parts.push(
        `water ${w.hydrationMl} ml effective (goal ${goals.waterGoalMl} ml = ${water.dailyGoalMl} ml + ${tr.hydrationMl} ml for training)`,
      );
    if (food.kcal > 0)
      parts.push(
        `ate ${Math.round(food.kcal)} kcal / ${Math.round(food.p)} g protein (targets ${cut.settings.kcal} kcal / ${goals.proteinG} g = ${cut.settings.protein} g + ${tr.proteinG} g for training)`,
      );
    if (kg !== undefined) parts.push(`weighed ${kg} kg`);
    rows.push(`- ${date}: ${parts.join("; ")}`);
  }
  if (!rows.length) return "";
  return ["## Hydration & nutrition on these days", "", ...rows].join("\n");
}
