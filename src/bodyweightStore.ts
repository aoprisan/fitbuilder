import { round2 } from "./util";

/**
 * Body-weight log — a small dated series the user keeps alongside the training
 * log. One entry per calendar day (re-logging a day overwrites it), stored on
 * this device only, like the 1RM store. Feeds relative-strength reads in Stats
 * and personalises the protein / calorie heuristics.
 */

export interface BodyweightEntry {
  /** Calendar day, "YYYY-MM-DD" (local). */
  date: string;
  kg: number;
}

const KEY = "gymlog.bodyweight";

/** Local calendar day for an entry, "YYYY-MM-DD". */
export function todayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isEntry(value: unknown): value is BodyweightEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["date"] === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v["date"]) &&
    typeof v["kg"] === "number" &&
    Number.isFinite(v["kg"]) &&
    v["kg"] > 0
  );
}

/** Every logged body-weight entry, oldest first; malformed entries dropped. */
export function loadBodyweights(): BodyweightEntry[] {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return [];
  }
  if (text === null) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isEntry)
    .map((e) => ({ date: e.date, kg: round2(e.kg) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function writeAll(entries: BodyweightEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Quota or privacy-mode failure: the entry just won't persist.
  }
}

/** Log (or correct) the body weight for a day; one entry per calendar day. */
export function logBodyweight(kg: number, date: string = todayKey()): void {
  if (!Number.isFinite(kg) || kg <= 0) return;
  const entries = loadBodyweights().filter((e) => e.date !== date);
  entries.push({ date, kg: round2(kg) });
  entries.sort((a, b) => a.date.localeCompare(b.date));
  writeAll(entries);
}

/** Forget the entry for a day. */
export function deleteBodyweight(date: string): void {
  const entries = loadBodyweights();
  const kept = entries.filter((e) => e.date !== date);
  if (kept.length !== entries.length) writeAll(kept);
}

/** The most recent entry, or null when none is logged. */
export function latestBodyweight(): BodyweightEntry | null {
  const entries = loadBodyweights();
  return entries[entries.length - 1] ?? null;
}
