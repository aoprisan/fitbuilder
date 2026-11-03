import type { Body } from "./bodyProfile";
import { DRINKS, type DrinkEntry } from "./drinks";

/**
 * What's still on board from the drink log — pure functions, no state.
 * Caffeine decays first-order (5 h half-life), so its zero crossing is closed
 * form; alcohol follows Widmark (linear absorption, then a constant 0.15 g/L
 * per hour), simulated minute by minute.
 */

export const HOUR_MS = 3_600_000;

export const CAFFEINE_HALF_LIFE_H = 5;
export const CAFFEINE_ABSORB_H = 0.75;
/**
 * Below this the body counts as clear. 25 mg is the dose below which caffeine
 * has no measurable effect on alertness or sleep — a 5 mg pharmacological
 * floor would put one morning coffee 26 h from clear.
 */
export const CAFFEINE_CLEAR_MG = 25;

export const ETHANOL_DENSITY_G_PER_ML = 0.789;
export const ALCOHOL_ABSORB_H = 0.5;
export const BAC_ELIM_G_PER_L_H = 0.15;
/** Below this we call it sober. */
export const BAC_CLEAR_G_PER_L = 0.01;

/** Only drinks this recent can still be on board. */
export const LOOKBACK_MS = 36 * HOUR_MS;
const SIM_STEP_MS = 60_000;

export interface Point {
  t: number;
  v: number;
}

export function caffeineMgOf(entry: DrinkEntry): number {
  return entry.amountMl * DRINKS[entry.kind].caffeineMgPerMl;
}

export function alcoholGramsOf(entry: DrinkEntry): number {
  return entry.amountMl * (DRINKS[entry.kind].abv / 100) * ETHANOL_DENSITY_G_PER_ML;
}

function absorbedFraction(hoursSince: number, rampH: number): number {
  if (hoursSince <= 0) return 0;
  return Math.min(1, hoursSince / rampH);
}

/* ── caffeine ─────────────────────────────────────────── */

/** Milligrams of caffeine still on board at time `t`. */
export function caffeineAt(entries: readonly DrinkEntry[], t: number): number {
  let total = 0;
  for (const e of entries) {
    const mg = caffeineMgOf(e);
    if (mg <= 0 || e.ts > t) continue;
    const h = (t - e.ts) / HOUR_MS;
    total += mg * absorbedFraction(h, CAFFEINE_ABSORB_H) * Math.pow(0.5, h / CAFFEINE_HALF_LIFE_H);
  }
  return total;
}

/** When caffeine falls under CAFFEINE_CLEAR_MG (closed form once the last dose is absorbed). */
export function caffeineClearAt(entries: readonly DrinkEntry[], now: number): number | null {
  const dosed = entries.filter((e) => caffeineMgOf(e) > 0 && e.ts >= now - LOOKBACK_MS);
  if (dosed.length === 0) return null;
  const lastTs = Math.max(...dosed.map((e) => e.ts));
  const from = Math.max(now, lastTs + CAFFEINE_ABSORB_H * HOUR_MS);
  const load = caffeineAt(dosed, from);
  if (load <= CAFFEINE_CLEAR_MG) return from;
  return from + CAFFEINE_HALF_LIFE_H * Math.log2(load / CAFFEINE_CLEAR_MG) * HOUR_MS;
}

/** Caffeine logged but not yet absorbed — still on the way in. */
export function unabsorbedCaffeineMg(entries: readonly DrinkEntry[], t: number): number {
  return entries.reduce((mg, e) => {
    const dose = caffeineMgOf(e);
    if (dose <= 0 || e.ts > t) return mg;
    return mg + dose * (1 - absorbedFraction((t - e.ts) / HOUR_MS, CAFFEINE_ABSORB_H));
  }, 0);
}

export function caffeineCurve(
  entries: readonly DrinkEntry[],
  from: number,
  to: number,
  points = 72,
): Point[] {
  const span = Math.max(1, to - from);
  return Array.from({ length: points }, (_, i) => {
    const t = from + (span * i) / (points - 1);
    return { t, v: caffeineAt(entries, t) };
  });
}

/* ── alcohol ──────────────────────────────────────────── */

/**
 * Widmark's distribution factor r, refined for build by Seidl et al. (2000).
 * Needs height and weight; null until both are known.
 */
export function widmarkR(body: Body): number | null {
  const { heightCm, weightKg, sex } = body;
  if (!heightCm || !weightKg) return null;
  const male = 0.31608 - 0.004821 * weightKg + 0.004632 * heightCm;
  const female = 0.31223 - 0.006446 * weightKg + 0.004466 * heightCm;
  const r = sex === "male" ? male : sex === "female" ? female : (male + female) / 2;
  return Math.min(0.9, Math.max(0.4, r));
}

function alcoholDrinks(entries: readonly DrinkEntry[], until: number): DrinkEntry[] {
  return entries
    .filter((e) => alcoholGramsOf(e) > 0 && e.ts <= until && e.ts >= until - LOOKBACK_MS)
    .sort((a, b) => a.ts - b.ts);
}

/** Blood alcohol (g/L) sampled at ascending `sampleTimes`; null without body measures. */
function simulateBac(
  entries: readonly DrinkEntry[],
  sampleTimes: readonly number[],
  body: Body,
): number[] | null {
  const r = widmarkR(body);
  const weightKg = body.weightKg;
  if (r === null || !weightKg) return null;
  const end = sampleTimes[sampleTimes.length - 1];
  if (end === undefined) return [];

  const drinks = alcoholDrinks(entries, end);
  const firstDrink = drinks[0];
  if (!firstDrink) return sampleTimes.map(() => 0);

  const absorbedGramsAt = (t: number): number =>
    drinks.reduce(
      (g, e) => g + alcoholGramsOf(e) * absorbedFraction((t - e.ts) / HOUR_MS, ALCOHOL_ABSORB_H),
      0,
    );

  const out: number[] = [];
  let next = 0;
  let bac = 0;
  let prevGrams = 0;
  let t = Math.min(firstDrink.ts, sampleTimes[0] ?? firstDrink.ts);

  const flush = (): void => {
    while (next < sampleTimes.length && (sampleTimes[next] ?? Infinity) <= t) {
      out.push(bac);
      next++;
    }
  };
  flush();
  while (next < sampleTimes.length) {
    const step = Math.min(SIM_STEP_MS, (sampleTimes[next] ?? t) - t);
    const to = t + step;
    bac = Math.max(0, bac - BAC_ELIM_G_PER_L_H * (step / HOUR_MS));
    const grams = absorbedGramsAt(to);
    bac += (grams - prevGrams) / (r * weightKg);
    prevGrams = grams;
    t = to;
    flush();
  }
  return out;
}

/** Blood alcohol at time `t`, in g/L. Null when body measures are missing. */
export function bacAt(entries: readonly DrinkEntry[], t: number, body: Body): number | null {
  const sampled = simulateBac(entries, [t], body);
  return sampled ? (sampled[0] ?? 0) : null;
}

export function bacCurve(
  entries: readonly DrinkEntry[],
  from: number,
  to: number,
  body: Body,
  points = 72,
): Point[] | null {
  const span = Math.max(1, to - from);
  const times = Array.from({ length: points }, (_, i) => from + (span * i) / (points - 1));
  const values = simulateBac(entries, times, body);
  if (!values) return null;
  return times.map((t, i) => ({ t, v: values[i] ?? 0 }));
}

/** When blood alcohol reaches zero. Elimination is linear, so this is exact. */
export function soberAt(entries: readonly DrinkEntry[], now: number, body: Body): number | null {
  if (widmarkR(body) === null) return null;
  const drinks = alcoholDrinks(entries, now);
  const last = drinks[drinks.length - 1];
  if (!last) return null;
  const from = Math.max(now, last.ts + ALCOHOL_ABSORB_H * HOUR_MS);
  const bac = bacAt(entries, from, body) ?? 0;
  if (bac <= BAC_CLEAR_G_PER_L) return from;
  return from + (bac / BAC_ELIM_G_PER_L_H) * HOUR_MS;
}

/** Alcohol logged but not yet absorbed — still on the way in. */
export function unabsorbedAlcoholG(entries: readonly DrinkEntry[], t: number): number {
  return alcoholDrinks(entries, t).reduce(
    (g, e) =>
      g + alcoholGramsOf(e) * (1 - absorbedFraction((t - e.ts) / HOUR_MS, ALCOHOL_ABSORB_H)),
    0,
  );
}

/** g/L → percent BAC (g per 100 ml). */
export function gramsPerLitreToPercent(gl: number): number {
  return gl / 10;
}
