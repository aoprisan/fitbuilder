import type { RoutineSheet } from "./types";
import { validateSheet } from "./sheetValidate";

const KEY = "gymlog.sheets";

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
