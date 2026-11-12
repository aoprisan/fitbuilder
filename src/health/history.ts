import { addDays, dayTotals, type CutState, type Macros } from "./cutModel";
import { waterDays, type WaterState } from "./waterStore";

/**
 * Day-by-day and week-by-week series over the Water and Fuel logs, for the
 * history charts. Pure: no DOM, no storage. A day with nothing logged is
 * `null` (not 0), so a chart can leave a gap instead of a false dip.
 */

export interface DayPoint<T> {
  /** "YYYY-MM-DD" */
  date: string;
  value: T | null;
}

/** Every day from `from` to `to` inclusive, oldest first. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 4000; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Hydration (ml, drink factor applied) per day over the last `days` days ending `today`. */
export function waterSeries(water: WaterState, today: string, days: number): DayPoint<number>[] {
  const byDay = new Map(waterDays(water.entries).map((d) => [d.date, d.hydrationMl]));
  return dayRange(addDays(today, -(days - 1)), today).map((date) => ({ date, value: byDay.get(date) ?? null }));
}

function logged(state: CutState, day: string): boolean {
  return (state.days[day]?.entries.length ?? 0) > 0;
}

/** Calories and macros per day over the last `days` days ending `today`. */
export function macroSeries(state: CutState, today: string, days: number): DayPoint<Macros>[] {
  return dayRange(addDays(today, -(days - 1)), today).map((date) => ({
    date,
    value: logged(state, date) ? dayTotals(state, date) : null,
  }));
}

/** Every day with food logged, newest first. */
export function loggedFoodDays(state: CutState): { date: string; totals: Macros }[] {
  return Object.keys(state.days)
    .filter((d) => logged(state, d))
    .sort()
    .reverse()
    .map((date) => ({ date, totals: dayTotals(state, date) }));
}

/** Monday of the week holding `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00`).getDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export interface WeekKcal {
  /** Monday, "YYYY-MM-DD" */
  start: string;
  /** Sum of the logged days' kcal. */
  kcal: number;
  /** Days with food logged in that week. */
  loggedDays: number;
  /** kcal / loggedDays (0 when nothing was logged). */
  avgPerDay: number;
}

/** The last `weeks` Monday-started weeks ending with the week of `today`, oldest first. */
export function weeklyKcal(state: CutState, today: string, weeks: number): WeekKcal[] {
  const last = weekStart(today);
  const out: WeekKcal[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(last, -7 * i);
    let kcal = 0;
    let loggedDays = 0;
    for (let j = 0; j < 7; j++) {
      const d = addDays(start, j);
      if (d > today || !logged(state, d)) continue;
      kcal += dayTotals(state, d).kcal;
      loggedDays++;
    }
    out.push({ start, kcal: Math.round(kcal), loggedDays, avgPerDay: loggedDays ? Math.round(kcal / loggedDays) : 0 });
  }
  return out;
}

/** Mean of the non-null values (null when there are none). */
export function meanOf(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
