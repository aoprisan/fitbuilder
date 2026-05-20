import type { RoutineSheet } from "./types";
import { validateSheet } from "./sheetValidate";

const KEY = "gymlog.sheets";
/** Ids of bundled sheets already seeded, so a deleted one isn't resurrected. */
const SEEDED_KEY = "gymlog.sheets.seeded";

function readRaw(): unknown {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return [];
  }
  if (text === null) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/** Load all saved sheets. Invalid entries are skipped rather than failing the whole read. */
export function loadSheets(): RoutineSheet[] {
  const raw = readRaw();
  if (!Array.isArray(raw)) return [];
  const sheets: RoutineSheet[] = [];
  for (const entry of raw) {
    try {
      sheets.push(validateSheet(entry));
    } catch {
      // Drop corrupt entries silently; the rest remain usable.
    }
  }
  return sheets;
}

function writeAll(sheets: RoutineSheet[]): void {
  localStorage.setItem(KEY, JSON.stringify(sheets));
}

/** Insert or update a sheet by id, stamping updatedAt. Returns the stored copy. */
export function saveSheet(sheet: RoutineSheet): RoutineSheet & { updatedAt: string } {
  const stored = { ...sheet, updatedAt: new Date().toISOString() };
  const sheets = loadSheets();
  const idx = sheets.findIndex((s) => s.id === stored.id);
  if (idx >= 0) sheets[idx] = stored;
  else sheets.push(stored);
  writeAll(sheets);
  return stored;
}

/** Remove a sheet by id. */
export function deleteSheet(id: string): void {
  writeAll(loadSheets().filter((s) => s.id !== id));
}

function seededIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEDED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Add a bundled sheet exactly once. It's saved only if its id has never been
 * seeded before and isn't already present, then its id is recorded — so a user
 * who later deletes it won't see it return on the next load.
 */
export function seedSheetOnce(sheet: RoutineSheet): void {
  const seeded = seededIds();
  if (seeded.includes(sheet.id)) return;
  if (!loadSheets().some((s) => s.id === sheet.id)) saveSheet(sheet);
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify([...seeded, sheet.id]));
  } catch {
    // If we can't record the marker, worst case is it's re-added next load.
  }
}
