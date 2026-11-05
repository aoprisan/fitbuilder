import { todayKey } from "../bodyweightStore";
import { uuid } from "../util";

/**
 * Vitamins and supplements (`gymlog.supplements`): the user's stack — what they
 * take, how much and how many times a day — and every dose ticked off. A dose
 * keeps a copy of the name, amount and unit it was taken at, so editing or
 * removing a stack item never rewrites what was already logged. Malformed
 * entries are dropped on load.
 */

export const SUPP_UNITS = ["g", "mg", "µg", "IU", "caps", "tab", "ml"] as const;
export type SuppUnit = (typeof SUPP_UNITS)[number];

export const SUPP_KINDS = [
  "creatine",
  "b12",
  "bcomplex",
  "d3",
  "omega3",
  "magnesium",
  "zinc",
  "vitc",
  "multi",
  "other",
] as const;
export type SuppKind = (typeof SUPP_KINDS)[number];

export interface Supplement {
  id: string;
  kind: SuppKind;
  name: string;
  /** Amount per dose, in `unit`. */
  dose: number;
  unit: SuppUnit;
  /** Doses planned per day (1–6). */
  perDay: number;
}

export interface SuppDose {
  id: string;
  suppId: string;
  ts: number;
  /** Snapshot of the stack item at the time it was taken. */
  name: string;
  amount: number;
  unit: SuppUnit;
}

export interface SuppState {
  stack: Supplement[];
  doses: SuppDose[];
}

export interface SuppPreset {
  kind: Exclude<SuppKind, "other">;
  name: string;
  dose: number;
  unit: SuppUnit;
  /** Short how-to (English source; translated in the view). */
  note: string;
}

/** Common picks with a typical dose — a starting point the user edits. */
export const SUPP_PRESETS: readonly SuppPreset[] = [
  { kind: "creatine", name: "Creatine monohydrate", dose: 5, unit: "g", note: "Every day, any time — stores fill in ~3–4 weeks at 3–5 g." },
  { kind: "b12", name: "Vitamin B12", dose: 1000, unit: "µg", note: "Morning; worth it on a plant-based diet." },
  { kind: "bcomplex", name: "Vitamin B complex", dose: 1, unit: "caps", note: "Morning, with food." },
  { kind: "d3", name: "Vitamin D3", dose: 2000, unit: "IU", note: "With a meal that has some fat." },
  { kind: "omega3", name: "Omega-3 (EPA + DHA)", dose: 1, unit: "g", note: "With a meal." },
  { kind: "magnesium", name: "Magnesium", dose: 300, unit: "mg", note: "Evening." },
  { kind: "zinc", name: "Zinc", dose: 15, unit: "mg", note: "With food, apart from iron or calcium." },
  { kind: "vitc", name: "Vitamin C", dose: 500, unit: "mg", note: "Any time." },
  { kind: "multi", name: "Multivitamin", dose: 1, unit: "tab", note: "With breakfast." },
];

export const SUPP_KEY = "gymlog.supplements";

const isUnit = (v: unknown): v is SuppUnit => typeof v === "string" && (SUPP_UNITS as readonly string[]).includes(v);
const isKind = (v: unknown): v is SuppKind => typeof v === "string" && (SUPP_KINDS as readonly string[]).includes(v);
const posNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export function clampPerDay(n: number): number {
  return Math.max(1, Math.min(6, Math.round(Number.isFinite(n) ? n : 1)));
}

function coerceSupp(raw: unknown): Supplement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r["id"];
  const name = r["name"];
  if (typeof id !== "string" || typeof name !== "string" || !name.trim()) return null;
  if (!posNum(r["dose"]) || !isUnit(r["unit"])) return null;
  return {
    id,
    kind: isKind(r["kind"]) ? r["kind"] : "other",
    name: name.trim(),
    dose: r["dose"],
    unit: r["unit"],
    perDay: clampPerDay(typeof r["perDay"] === "number" ? r["perDay"] : 1),
  };
}

function coerceDose(raw: unknown): SuppDose | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const { id, suppId, ts, name } = r;
  if (typeof id !== "string" || typeof suppId !== "string" || typeof name !== "string") return null;
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  if (!posNum(r["amount"]) || !isUnit(r["unit"])) return null;
  return { id, suppId, ts, name, amount: r["amount"], unit: r["unit"] };
}

export function parseSuppState(raw: unknown): SuppState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = <T>(v: unknown, f: (x: unknown) => T | null): T[] =>
    Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : [];
  return { stack: list(r["stack"], coerceSupp), doses: list(r["doses"], coerceDose) };
}

export function loadSupps(): SuppState {
  try {
    const raw = localStorage.getItem(SUPP_KEY);
    return raw ? parseSuppState(JSON.parse(raw)) : { stack: [], doses: [] };
  } catch {
    return { stack: [], doses: [] };
  }
}

export function saveSupps(state: SuppState): void {
  try {
    localStorage.setItem(SUPP_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy mode — the change just won't persist.
  }
}

/** Load → change → save; returns the saved state. */
export function updateSupps(fn: (s: SuppState) => SuppState): SuppState {
  const next = fn(loadSupps());
  saveSupps(next);
  return next;
}

export function newSupplement(fields: Omit<Supplement, "id">): Supplement {
  return { ...fields, id: uuid(), name: fields.name.trim(), perDay: clampPerDay(fields.perDay) };
}

export function doseOf(s: Supplement, ts = Date.now()): SuppDose {
  return { id: uuid(), suppId: s.id, ts, name: s.name, amount: s.dose, unit: s.unit };
}

/** Doses taken on a local calendar day (default today), oldest first. */
export function dosesOn(doses: readonly SuppDose[], date = todayKey(), suppId?: string): SuppDose[] {
  return doses
    .filter((d) => (suppId === undefined || d.suppId === suppId) && todayKey(new Date(d.ts)) === date)
    .sort((a, b) => a.ts - b.ts);
}

export interface SuppDayStatus {
  /** Stack items with every planned dose taken. */
  done: number;
  /** Items in the stack. */
  total: number;
}

/** How much of the stack is ticked off on a day. */
export function stackStatus(state: SuppState, date = todayKey()): SuppDayStatus {
  let done = 0;
  for (const s of state.stack) if (dosesOn(state.doses, date, s.id).length >= s.perDay) done++;
  return { done, total: state.stack.length };
}

/** "YYYY-MM-DD" keys of the last `n` days ending at `end`, oldest first. */
export function lastDays(n: number, end = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 12);
    out.push(todayKey(d));
  }
  return out;
}

/** Days in the window with at least one dose of the item. */
export function daysTaken(doses: readonly SuppDose[], suppId: string, days: readonly string[]): number {
  const taken = new Set(doses.filter((d) => d.suppId === suppId).map((d) => todayKey(new Date(d.ts))));
  return days.filter((d) => taken.has(d)).length;
}

/** Consecutive days with a dose, counting back from today (or yesterday if today isn't ticked yet). */
export function streak(doses: readonly SuppDose[], suppId: string, now = new Date()): number {
  const taken = new Set(doses.filter((d) => d.suppId === suppId).map((d) => todayKey(new Date(d.ts))));
  let n = 0;
  let i = taken.has(todayKey(now)) ? 0 : 1;
  for (;; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12);
    if (!taken.has(todayKey(d))) break;
    n++;
  }
  return n;
}

export type CreatineRead = "loading" | "saturated" | "lapsed";

/**
 * Rough creatine store read from the last 28 days: daily 3–5 g fills muscle
 * stores in about three to four weeks and they drain over a similar span.
 * ≥ 21 days taken → saturated; ≥ 1 day in the last week → still loading;
 * otherwise lapsed.
 */
export function creatineRead(doses: readonly SuppDose[], suppId: string, now = new Date()): { read: CreatineRead; days: number } {
  const days = daysTaken(doses, suppId, lastDays(28, now));
  const week = daysTaken(doses, suppId, lastDays(7, now));
  return { read: days >= 21 && week >= 4 ? "saturated" : week >= 1 ? "loading" : "lapsed", days };
}

export function formatDose(amount: number, unit: SuppUnit): string {
  const n = Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 100) / 100);
  return `${n} ${unit}`;
}

/** One day's doses as "Creatine 5 g, Vitamin B12 1000 µg ×2" for reports. */
export function dayDoseSummary(doses: readonly SuppDose[], date: string): string {
  const groups = new Map<string, { d: SuppDose; n: number }>();
  for (const d of dosesOn(doses, date)) {
    const key = `${d.suppId}|${d.amount}|${d.unit}`;
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { d, n: 1 });
  }
  return [...groups.values()]
    .map(({ d, n }) => `${d.name} ${formatDose(d.amount, d.unit)}${n > 1 ? ` ×${n}` : ""}`)
    .join(", ");
}
