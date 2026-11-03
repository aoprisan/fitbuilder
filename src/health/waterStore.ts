import { todayKey } from "../bodyweightStore";
import { uuid } from "../util";
import { hydrationOf, isDrinkKind, type DrinkEntry, type DrinkKind } from "./drinks";
import { migrateHealthApp } from "./migrate";

/**
 * The drink log behind the Water view (`gymlog.water`): every drink logged,
 * plus the daily hydration goal. Malformed entries are dropped on load.
 */

export interface WaterState {
  entries: DrinkEntry[];
  dailyGoalMl: number;
}

export const WATER_KEY = "gymlog.water";
export const DEFAULT_GOAL_ML = 2000;

function coerceEntry(raw: unknown): DrinkEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r["id"];
  const ts = r["ts"];
  const ml = r["amountMl"];
  if (typeof id !== "string" || typeof ts !== "number" || !Number.isFinite(ts)) return null;
  if (typeof ml !== "number" || !Number.isFinite(ml) || ml <= 0) return null;
  return { id, ts, amountMl: Math.round(ml), kind: isDrinkKind(r["kind"]) ? r["kind"] : "water" };
}

/** Accepts this app's shape and the standalone health app's `{entries, settings}`. */
export function parseWaterState(raw: unknown): WaterState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const entries = Array.isArray(r["entries"])
    ? r["entries"].map(coerceEntry).filter((e): e is DrinkEntry => e !== null)
    : [];
  const settings = (r["settings"] ?? {}) as Record<string, unknown>;
  const goal = r["dailyGoalMl"] ?? settings["dailyGoalMl"];
  return {
    entries,
    dailyGoalMl:
      typeof goal === "number" && Number.isFinite(goal) && goal > 0 ? Math.round(goal) : DEFAULT_GOAL_ML,
  };
}

export function loadWater(): WaterState {
  migrateHealthApp();
  try {
    const raw = localStorage.getItem(WATER_KEY);
    return raw ? parseWaterState(JSON.parse(raw)) : { entries: [], dailyGoalMl: DEFAULT_GOAL_ML };
  } catch {
    return { entries: [], dailyGoalMl: DEFAULT_GOAL_ML };
  }
}

export function saveWater(state: WaterState): void {
  try {
    localStorage.setItem(WATER_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy mode — the change just won't persist.
  }
}

export function addDrink(amountMl: number, kind: DrinkKind, ts = Date.now()): DrinkEntry | null {
  if (!Number.isFinite(amountMl) || amountMl <= 0) return null;
  const s = loadWater();
  const entry: DrinkEntry = { id: uuid(), ts, amountMl: Math.round(amountMl), kind };
  s.entries.push(entry);
  saveWater(s);
  return entry;
}

export function removeDrink(id: string): void {
  const s = loadWater();
  saveWater({ ...s, entries: s.entries.filter((e) => e.id !== id) });
}

export function setWaterGoal(ml: number): void {
  if (!Number.isFinite(ml) || ml <= 0) return;
  saveWater({ ...loadWater(), dailyGoalMl: Math.round(ml) });
}

export interface WaterDay {
  date: string;
  totalMl: number;
  hydrationMl: number;
  entries: DrinkEntry[];
}

/** Every day with drinks, newest first; each day's entries newest first. */
export function waterDays(entries: readonly DrinkEntry[]): WaterDay[] {
  const groups = new Map<string, DrinkEntry[]>();
  for (const e of entries) {
    const key = todayKey(new Date(e.ts));
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .map(([date, es]) => ({
      date,
      entries: es.sort((a, b) => b.ts - a.ts),
      totalMl: es.reduce((s, e) => s + e.amountMl, 0),
      hydrationMl: Math.round(es.reduce((s, e) => s + hydrationOf(e), 0)),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** One day's drinks (default today). */
export function waterDay(entries: readonly DrinkEntry[], date = todayKey()): WaterDay {
  return (
    waterDays(entries).find((d) => d.date === date) ?? { date, totalMl: 0, hydrationMl: 0, entries: [] }
  );
}
