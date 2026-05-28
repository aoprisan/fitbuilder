import { prescriptionToTarget } from "../execute";
import { catalogIdentityFor } from "../sheet";
import {
  SHEET_SCHEMA_ID,
  SHEET_SCHEMA_VERSION,
  type Routine,
  type RoutineSheet,
} from "../types";
import { uuid } from "../util";

/** Thrown when a file can't be turned into any routines. Message is shown to the user. */
export class ImportError extends Error {
  override name = "ImportError";
}

/** A single source row as ordered, left-to-right cell strings. Empty cells allowed. */
export type GridRow = string[];

/** Collapse internal whitespace and trim. */
function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// A lone index cell ("1", "1.0") sitting in its own column (the XLSX layout).
const PURE_INDEX = /^\d{1,3}(?:[.,]\d+)?$/;
// An index glued onto the exercise name ("1 Ramat Banda Elastica") — the PDF layout.
const LEADING_INDEX = /^(\d{1,3})[.)]?\s+(\S.*)$/;

type Parsed =
  | { kind: "header"; title: string; tags: string[] }
  | { kind: "exercise"; name: string; prescription: string }
  | null;

/**
 * Classify one row of cells as a routine header or an exercise. The same
 * heuristic serves both XLSX (where the index sits in its own column) and PDF
 * (where pdf.js glues the index onto the name), because it accepts either shape:
 *
 *   "1" | "Dips" | "30-50 repetari"   → exercise (index in its own cell)
 *   "1 Dips" | "30-50 repetari"       → exercise (index glued to the name)
 *   "RUTINA IMPINS" | "PARC" | "BAIAT" → header  (title + tag chips)
 *   "5 Chin-Ups"                       → exercise (rep-prefixed, no prescription)
 */
function classify(row: GridRow): Parsed {
  const cells = row.map(clean).filter((c) => c !== "");
  if (cells.length === 0) return null; // blank row / routine separator

  const first = cells[0] ?? "";

  // Index in its own cell → exercise. Name is the next cell, prescription the rest.
  if (PURE_INDEX.test(first) && cells.length >= 2) {
    return {
      kind: "exercise",
      name: cells[1] ?? "",
      prescription: cells.slice(2).join(" — "),
    };
  }

  // Index glued to the name, followed by a prescription column → exercise.
  const m = LEADING_INDEX.exec(first);
  if (m && cells.length >= 2) {
    return {
      kind: "exercise",
      name: m[2] ?? first,
      prescription: cells.slice(1).join(" — "),
    };
  }

  // Several text cells → a routine header: a title followed by tag chips.
  if (cells.length >= 2) {
    return { kind: "header", title: first, tags: cells.slice(1) };
  }

  // A single text cell → an exercise with no separate prescription (e.g. the
  // rep-prefixed "5 Chin-Ups" lines on the TEST FLUX challenge blocks).
  return { kind: "exercise", name: first, prescription: "" };
}

/**
 * Turn a normalized cell grid into routines. Rows are read top-to-bottom: a
 * header opens a new routine and the exercise rows beneath it fill that routine.
 * Exercises seen before any header start an untitled routine so nothing is lost.
 * Routines that capture no exercises (a stray title line) are dropped.
 */
export function gridToRoutines(rows: GridRow[]): Routine[] {
  const routines: Routine[] = [];
  let current: Routine | null = null;

  for (const row of rows) {
    const parsed = classify(row);
    if (!parsed) continue;

    if (parsed.kind === "header") {
      current = { title: parsed.title, tags: parsed.tags, exercises: [] };
      routines.push(current);
      continue;
    }

    if (parsed.name === "") continue;
    if (!current) {
      current = { title: "Routine", tags: [], exercises: [] };
      routines.push(current);
    }
    // Auto-convert the wall-chart's free text into a rep volume where it parses
    // (e.g. "30-50 repetari" → 50 reps); otherwise carry it as a display note.
    const { target, note } = prescriptionToTarget(parsed.prescription);
    current.exercises.push({
      name: parsed.name,
      ...(target ? { target } : {}),
      ...(note ? { note } : {}),
      ...catalogIdentityFor(parsed.name),
    });
  }

  return routines.filter((r) => r.exercises.length > 0);
}

/** The routine title that appears most often — used to name an imported sheet. */
export function dominantTitle(routines: Routine[]): string | null {
  const counts = new Map<string, number>();
  for (const r of routines) {
    const t = clean(r.title);
    if (t !== "") counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [title, n] of counts) {
    if (n > bestN) {
      best = title;
      bestN = n;
    }
  }
  return best;
}

/** Wrap parsed routines in a fresh, storable sheet. */
export function routinesToSheet(name: string, routines: Routine[]): RoutineSheet {
  return {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id: uuid(),
    name: clean(name) || "Imported Routines",
    routines,
    updatedAt: new Date().toISOString(),
  };
}
