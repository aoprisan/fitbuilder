import { loadBodyweights, logBodyweight, removeBodyweight } from "../bodyweightStore";
import {
  cloneMeals,
  DEFAULT_FOODS,
  DEFAULT_MEALS,
  defaultCutState,
  type CutSettings,
  type CutState,
  type Food,
  type FoodEntry,
  type Meal,
  type MealItem,
} from "./cutModel";
import { migrateHealthApp } from "./migrate";

/**
 * Persistence for the Fuel view (`gymlog.cut`). Weigh-ins are not kept here:
 * they live in the shared body-weight log, so a weigh-in on Fuel, the weight in
 * Settings and the protein / calorie heuristics on a session all read one series.
 */

export const CUT_KEY = "gymlog.cut";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
const pos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

function coerceSettings(raw: unknown, base: CutSettings): CutSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kcal = r["kcal"];
  const protein = r["protein"];
  const winStart = r["winStart"];
  const winEnd = r["winEnd"];
  const startDate = r["startDate"];
  const weeks = r["weeks"];
  const startWeight = r["startWeight"];
  const goalWeight = r["goalWeight"];
  return {
    kcal: pos(kcal) ? kcal : base.kcal,
    protein: pos(protein) ? protein : base.protein,
    winStart: isTime(winStart) ? winStart : base.winStart,
    winEnd: isTime(winEnd) ? winEnd : base.winEnd,
    startDate: isDay(startDate) ? startDate : base.startDate,
    weeks: pos(weeks) ? Math.round(weeks) : base.weeks,
    startWeight: pos(startWeight) ? startWeight : null,
    goalWeight: pos(goalWeight) ? goalWeight : null,
  };
}

function coerceFoods(raw: unknown): Food[] {
  if (!Array.isArray(raw)) return DEFAULT_FOODS.map((f) => ({ ...f }));
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const opt = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
  return raw.flatMap((x): Food[] => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    const id = r["id"];
    const name = r["name"];
    if (typeof id !== "string" || typeof name !== "string") return [];
    const food: Food = { id, name, kcal: num(r["kcal"]), p: num(r["p"]) };
    let c = opt(r["c"]);
    let f = opt(r["f"]);
    // Pantries saved before carbs/fat existed: fill those two in for the stock foods.
    const stock = DEFAULT_FOODS.find((d) => d.id === id);
    if (stock && c === undefined && f === undefined) {
      c = stock.c;
      f = stock.f;
    }
    if (c !== undefined) food.c = c;
    if (f !== undefined) food.f = f;
    return [food];
  });
}

/** Missing (older saves, the standalone tracker's export) → the stock menu. */
function coerceMeals(raw: unknown): Meal[] {
  if (!Array.isArray(raw)) return cloneMeals(DEFAULT_MEALS);
  return raw.flatMap((m): Meal[] => {
    const r = (m ?? {}) as Record<string, unknown>;
    const name = r["name"];
    const items = r["items"];
    if (typeof name !== "string" || !name.trim() || !Array.isArray(items)) return [];
    const clean = items.flatMap((it): MealItem[] =>
      Array.isArray(it) && typeof it[0] === "string" && typeof it[1] === "number" && it[1] > 0
        ? [[it[0], it[1]]]
        : [],
    );
    return clean.length ? [{ name, items: clean }] : [];
  });
}

function coerceDays(raw: unknown): CutState["days"] {
  const out: CutState["days"] = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [day, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDay(day) || !v || typeof v !== "object") continue;
    const entries = (v as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) continue;
    const clean = entries.flatMap((e): FoodEntry[] => {
      const r = (e ?? {}) as Record<string, unknown>;
      const foodId = r["foodId"];
      const g = r["g"];
      return typeof foodId === "string" && typeof g === "number" && g >= 0 ? [{ foodId, g }] : [];
    });
    if (clean.length) out[day] = { entries: clean };
  }
  return out;
}

function coerceSeries(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [day, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isDay(day) && pos(v)) out[day] = v;
  }
  return out;
}

/**
 * Accepts this app's stored shape, the standalone health app's cut state and
 * the standalone cut tracker's export; throws if it is none of them. `weights`
 * holds whatever the file carried (empty for this app's own store).
 */
export function parseCutState(raw: unknown): CutState {
  if (!raw || typeof raw !== "object" || !("settings" in raw)) throw new Error("not a cut file");
  const r = raw as Record<string, unknown>;
  const base = defaultCutState();
  return {
    settings: coerceSettings(r["settings"], base.settings),
    foods: coerceFoods(r["foods"]),
    days: coerceDays(r["days"]),
    weights: coerceSeries(r["weights"]),
    waist: coerceSeries(r["waist"]),
    meals: coerceMeals(r["meals"]),
  };
}

/** Height carried by a standalone-tracker file (it kept its own). */
export function legacyHeightOf(raw: unknown): number | null {
  const h = (raw as { settings?: { height?: unknown } } | null)?.settings?.height;
  return typeof h === "number" && h >= 50 && h <= 260 ? h : null;
}

/** Fold weigh-ins into the shared body-weight log; days already logged there win. */
export function mergeWeighIns(weights: Record<string, number>): void {
  const have = new Set(loadBodyweights().map((e) => e.date));
  for (const [day, kg] of Object.entries(weights)) if (!have.has(day)) logBodyweight(kg, day);
}

function bodyweightSeries(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of loadBodyweights()) out[e.date] = e.kg;
  return out;
}

export function loadCut(): CutState {
  migrateHealthApp();
  let state: CutState;
  try {
    const raw = localStorage.getItem(CUT_KEY);
    state = raw ? parseCutState(JSON.parse(raw)) : defaultCutState();
  } catch {
    state = defaultCutState();
  }
  return { ...state, weights: bodyweightSeries() };
}

export function saveCut(state: CutState): void {
  const { weights: _shared, ...rest } = state;
  void _shared;
  try {
    localStorage.setItem(CUT_KEY, JSON.stringify(rest));
  } catch {
    // Quota or privacy mode — the change just won't persist.
  }
}

/** Load, change, save — every Fuel mutation goes through here. */
export function updateCut(fn: (s: CutState) => CutState): CutState {
  const next = fn(loadCut());
  saveCut(next);
  return next;
}

/** A weigh-in: one per day, written to the shared body-weight log. */
export function setWeighIn(day: string, kg: number): void {
  logBodyweight(kg, day);
}

/** Drop a day's weigh-in and waist measurement. */
export function removeMeasurement(day: string): void {
  removeBodyweight(day);
  updateCut((s) => {
    const waist = { ...s.waist };
    delete waist[day];
    return { ...s, waist };
  });
}
