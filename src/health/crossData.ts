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
import { dayDoseSummary, loadSupps } from "./suppStore";
import { loadWater, waterDay } from "./waterStore";

/**
 * Where the three logs meet. Training, drinks and food are kept in their own
 * stores and shown on their own tabs; these reads join them for one calendar
 * day so each view can show what the others imply:
 *
 *  - Water: the day's sessions add their effort-based fluid estimate to the goal.
 *  - Fuel: the day's sessions show their rough burn and the protein to eat in
 *    the meal after training. Both targets stay as set: the daily protein
 *    target already covers training, and the burn isn't meant to be eaten back.
 *  - Body / History: water, food and supplements logged on a day sit beside its training.
 */

export interface TrainingDay {
  sessions: TrainingSession[];
  /** Effort-based fluid to replace for the day's training, ml. */
  hydrationMl: number;
  /** Rough kcal burned by the day's training. */
  kcal: number;
  /** Protein to eat after the day's training, g — a serving, not a target top-up. */
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
 * The water goal for a day, with its training fluid added, ml. Only water grows
 * with training (it replaces sweat actually lost); protein and calorie targets
 * stay as set.
 */
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
  proteinTarget: number;
}

/** Drinks, food and training for one day, side by side. */
export function dayLedger(date = todayKey(), sessions = loadSessions()): DayLedger {
  const training = trainingOn(date, sessions);
  const water = loadWater();
  const cut = loadCut();
  return {
    date,
    training,
    hydrationMl: waterDay(water.entries, date).hydrationMl,
    waterGoalMl: trainingWaterGoal(water.dailyGoalMl, training),
    food: dayTotals(cut, date),
    kcalTarget: cut.settings.kcal,
    proteinTarget: cut.settings.protein,
  };
}

/**
 * Hydration, food, weigh-ins and supplement doses on the days of the given sessions, as a
 * Markdown section for the "Analyze with Claude" report — so the analysis can
 * weigh a flat session against a short night of water or a deep deficit.
 * Empty when none of those days has anything logged.
 */
export function healthContextMarkdown(sessions: readonly TrainingSession[]): string {
  const days = [...new Set(sessions.map((s) => todayKey(new Date(s.startedAt))))].sort();
  if (!days.length) return "";
  const water = loadWater();
  const cut = loadCut();
  const supps = loadSupps();
  const all = loadSessions();
  const rows: string[] = [];
  for (const date of days) {
    const w = waterDay(water.entries, date);
    const food = dayTotals(cut, date);
    const kg = cut.weights[date];
    const took = dayDoseSummary(supps.doses, date);
    if (w.entries.length === 0 && food.kcal === 0 && kg === undefined && !took) continue;
    const tr = trainingOn(date, all);
    const waterGoal = trainingWaterGoal(water.dailyGoalMl, tr);
    const parts: string[] = [];
    if (w.entries.length)
      parts.push(
        `water ${w.hydrationMl} ml effective (goal ${waterGoal} ml = ${water.dailyGoalMl} ml + ${tr.hydrationMl} ml for training)`,
      );
    if (food.kcal > 0)
      parts.push(
        `ate ${Math.round(food.kcal)} kcal / ${Math.round(food.p)} g protein (targets ${cut.settings.kcal} kcal / ${cut.settings.protein} g)`,
      );
    if (kg !== undefined) parts.push(`weighed ${kg} kg`);
    if (took) parts.push(`supplements: ${took}`);
    rows.push(`- ${date}: ${parts.join("; ")}`);
  }
  if (!rows.length) return "";
  return ["## Hydration, nutrition & supplements on these days", "", ...rows].join("\n");
}
