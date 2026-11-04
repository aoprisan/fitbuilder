/**
 * The cut (Fuel view): calorie / macro log, eating window, weigh-ins and waist.
 * Pure data + helpers, no DOM and no storage.
 */

export interface Food {
  id: string;
  name: string;
  /** kcal per 100 g */
  kcal: number;
  /** protein g per 100 g */
  p: number;
  /** carbs g per 100 g — optional: older pantries tracked kcal and protein only */
  c?: number;
  /** fat g per 100 g — optional, as above */
  f?: number;
}

/** Totals for a portion, a meal or a day. Missing carbs/fat count as 0. */
export interface Macros {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

export const ZERO_MACROS: Macros = { kcal: 0, p: 0, c: 0, f: 0 };

export function sumMacros(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f };
}

export interface FoodEntry {
  foodId: string;
  g: number;
}

export interface CutSettings {
  kcal: number;
  protein: number;
  /** "HH:MM" */
  winStart: string;
  winEnd: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  weeks: number;
  /** null → the first weigh-in on or after the start date */
  startWeight: number | null;
  goalWeight: number | null;
}

export type MealItem = [foodId: string, grams: number];

export interface Meal {
  name: string;
  items: MealItem[];
}

/**
 * Everything the Fuel view reads. `weights` is not stored with the rest: it is
 * the shared body-weight log (`gymlog.bodyweight`), filled in on load.
 */
export interface CutState {
  settings: CutSettings;
  foods: Food[];
  days: Record<string, { entries: FoodEntry[] }>;
  weights: Record<string, number>;
  waist: Record<string, number>;
  /** The "set the table" presets — editable, and what Claude's menu suggestions write to. */
  meals: Meal[];
}

export const DEFAULT_FOODS: readonly Food[] = [
  { id: "skyr", name: "Skyr (plain)", kcal: 63, p: 11, c: 4, f: 0.2 },
  { id: "beef", name: "Beef ≤5% fat (raw)", kcal: 125, p: 21, c: 0, f: 5 },
  { id: "schnitz", name: "Lidl schnitzel (check label)", kcal: 240, p: 14, c: 15, f: 14 },
  { id: "oats", name: "Oats", kcal: 372, p: 13.5, c: 60, f: 7 },
  { id: "berries", name: "Berries", kcal: 50, p: 1, c: 12, f: 0.3 },
  { id: "banana", name: "Banana", kcal: 89, p: 1.1, c: 23, f: 0.3 },
  { id: "rice", name: "Rice (cooked)", kcal: 130, p: 2.7, c: 28, f: 0.3 },
  { id: "potato", name: "Potatoes (boiled)", kcal: 80, p: 2, c: 18, f: 0.1 },
  { id: "veg", name: "Vegetables / salad", kcal: 25, p: 1.5, c: 4, f: 0.2 },
  { id: "oil", name: "Olive oil", kcal: 884, p: 0, c: 0, f: 100 },
  { id: "cocoa", name: "Cocoa (unsweetened)", kcal: 300, p: 20, c: 20, f: 13 },
  { id: "honey", name: "Honey", kcal: 304, p: 0.3, c: 82, f: 0 },
  { id: "egg", name: "Egg (≈55 g each)", kcal: 143, p: 12.6, c: 0.7, f: 9.5 },
  { id: "bread", name: "Bread", kcal: 250, p: 9, c: 46, f: 3 },
];

export const DEFAULT_MEALS: readonly Meal[] = [
  { name: "Skyr bowl", items: [["skyr", 400], ["oats", 30], ["berries", 150]] },
  { name: "Beef + rice", items: [["beef", 250], ["rice", 250], ["veg", 200]] },
  { name: "Schnitzel dinner", items: [["schnitz", 150], ["potato", 200], ["veg", 200], ["oil", 10]] },
  { name: "Evening skyr", items: [["skyr", 300], ["cocoa", 10]] },
  { name: "Beef swap", items: [["beef", 250], ["potato", 200], ["veg", 200], ["oil", 10]] },
];

export const cloneMeals = (ms: readonly Meal[]): Meal[] =>
  ms.map((m) => ({ name: m.name, items: m.items.map(([id, g]): MealItem => [id, g]) }));

/**
 * Save a meal for reuse under "Set the table": a meal with the same name (any
 * case) is replaced in place, otherwise it joins the end of the menu.
 */
export function upsertMeal(meals: readonly Meal[], meal: Meal): Meal[] {
  const key = (n: string): string => n.trim().toLowerCase();
  const i = meals.findIndex((m) => key(m.name) === key(meal.name));
  const copy = { name: meal.name.trim(), items: meal.items.map(([id, g]): MealItem => [id, g]) };
  return i < 0 ? [...meals, copy] : meals.map((m, j) => (j === i ? copy : m));
}

/* ─── dates (local, "YYYY-MM-DD") ─────────────────────────── */

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayIso = (now = Date.now()): string => isoDay(new Date(now));

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000,
  );
}

export function defaultSettings(now = Date.now()): CutSettings {
  return {
    kcal: 2300,
    protein: 185,
    winStart: "12:00",
    winEnd: "20:00",
    startDate: todayIso(now),
    weeks: 10,
    startWeight: null,
    goalWeight: null,
  };
}

export function defaultCutState(now = Date.now()): CutState {
  return {
    settings: defaultSettings(now),
    foods: DEFAULT_FOODS.map((f) => ({ ...f })),
    days: {},
    weights: {},
    waist: {},
    meals: cloneMeals(DEFAULT_MEALS),
  };
}

/* ─── calculations ─────────────────────────────────────────── */

export function foodById(foods: readonly Food[], id: string): Food | undefined {
  return foods.find((f) => f.id === id);
}

export function entryMacros(foods: readonly Food[], e: FoodEntry): Macros {
  const f = foodById(foods, e.foodId);
  if (!f) return ZERO_MACROS;
  const k = e.g / 100;
  return { kcal: f.kcal * k, p: f.p * k, c: (f.c ?? 0) * k, f: (f.f ?? 0) * k };
}

export function dayTotals(state: CutState, day: string): Macros {
  return (state.days[day]?.entries ?? []).reduce(
    (acc, e) => sumMacros(acc, entryMacros(state.foods, e)),
    ZERO_MACROS,
  );
}

export function mealMacros(foods: readonly Food[], meal: Meal): Macros {
  return meal.items.reduce(
    (acc, [foodId, g]) => sumMacros(acc, entryMacros(foods, { foodId, g })),
    ZERO_MACROS,
  );
}

export function sortedWeights(state: CutState): [string, number][] {
  return Object.entries(state.weights).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Mean of weigh-ins in the 7 days ending on `day`, or null if there are none. */
export function avg7(state: CutState, day: string): number | null {
  const from = addDays(day, -6);
  const v = sortedWeights(state)
    .filter(([d]) => d >= from && d <= day)
    .map(([, kg]) => kg);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function effectiveStartWeight(state: CutState): number | null {
  if (state.settings.startWeight !== null) return state.settings.startWeight;
  const ws = sortedWeights(state);
  const after = ws.find(([d]) => d >= state.settings.startDate);
  return (after ?? ws[0])?.[1] ?? null;
}

export function cutEndDate(s: CutSettings): string {
  return addDays(s.startDate, s.weeks * 7);
}

/** Where today sits in the cut: not started, week n of N, or done. */
export function cutWeek(
  s: CutSettings,
  now = Date.now(),
): { kind: "before" } | { kind: "week"; week: number } | { kind: "done" } {
  const n = daysBetween(s.startDate, todayIso(now));
  if (n < 0) return { kind: "before" };
  const wk = Math.floor(n / 7) + 1;
  return wk > s.weeks ? { kind: "done" } : { kind: "week", week: wk };
}

export function windowOpen(s: CutSettings, now = Date.now()): boolean {
  const d = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return hm >= s.winStart && hm < s.winEnd;
}

export const r1 = (x: number): number => Math.round(x * 10) / 10;
