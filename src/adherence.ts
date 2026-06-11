import { sessionAdherence } from "./benchmark";
import { parseTargetReps } from "./execute";
import type { RoutineSheet, TrainingSession } from "./types";

/**
 * Per-routine adherence summary built from logged sessions whose `fromSheetId`
 * matches the routine. Pure read: no schema, no storage — given the same inputs
 * it always returns the same shape.
 */
export interface AdherenceSummary {
  /** Number of sessions stamped with this sheet id. */
  runs: number;
  /** ISO timestamp of the most recent run, when at least one exists. */
  lastRunIso?: string;
  /**
   * Average per-session completion percentage in [0, 100], rounded. Computed
   * over exercises whose carried `prescription` parses to a rep target — timed
   * holds and unparseable rows are skipped. Absent when no run carried any
   * completion data (every row was timed/manual, or no runs).
   */
  avgCompletionPct?: number;
}

/** Per-session completion in [0, 1], or null when no exercise carried a parseable target. */
function sessionCompletion(session: TrainingSession): number | null {
  const fractions: number[] = [];
  for (const ex of session.exercises) {
    if (ex.prescription === undefined) continue;
    const target = parseTargetReps(ex.prescription);
    if (target === null || target <= 0) continue;
    const logged = ex.sets.reduce((a, s) => a + s.reps, 0);
    fractions.push(Math.min(1, logged / target));
  }
  if (fractions.length === 0) return null;
  return fractions.reduce((a, f) => a + f, 0) / fractions.length;
}

/**
 * One session's completion-of-plan percentage in [0, 100]: the structured
 * benchmark (`sessionAdherence`, when the session carried per-set targets)
 * first, falling back to the free-text prescription parse for older runs. Null
 * when the session carried nothing comparable.
 */
export function sessionPlanPct(session: TrainingSession): number | null {
  const structured = sessionAdherence(session);
  if (structured) return structured.pct;
  const c = sessionCompletion(session);
  return c === null ? null : Math.round(c * 100);
}

/**
 * Logged sessions started from a sheet — matching the sheet's own id and the
 * per-routine slice ids Train stamps (`"<sheetId>:r<index>"`), newest first.
 */
export function sessionsForSheet(
  sheetId: string,
  sessions: readonly TrainingSession[],
): TrainingSession[] {
  return sessions
    .filter(
      (s) =>
        s.fromSheetId !== undefined &&
        (s.fromSheetId === sheetId || s.fromSheetId.startsWith(`${sheetId}:r`)),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function summarizeAdherence(
  sheetId: string,
  sessions: readonly TrainingSession[],
): AdherenceSummary {
  const own = sessions.filter((s) => s.fromSheetId === sheetId);
  if (own.length === 0) return { runs: 0 };

  let lastRunIso = own[0]!.startedAt;
  for (const s of own) if (s.startedAt > lastRunIso) lastRunIso = s.startedAt;

  // Prefer the structured per-set benchmark for each run, falling back to the
  // free-text prescription parse — the same read the adherence report prints.
  const completions: number[] = [];
  for (const s of own) {
    const pct = sessionPlanPct(s);
    if (pct !== null) completions.push(pct);
  }

  return {
    runs: own.length,
    lastRunIso,
    ...(completions.length > 0
      ? {
          avgCompletionPct: Math.round(
            completions.reduce((a, c) => a + c, 0) / completions.length,
          ),
        }
      : {}),
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface MesoStatus {
  /** Current cycle week, 1-based, clamped to {@link ofWeeks}. */
  week: number;
  ofWeeks: number;
  /** True once the wall clock has run past the cycle's last week. */
  complete: boolean;
}

/**
 * Where a sheet's training cycle stands. The clock starts at the *first logged
 * run* of the sheet — a cycle hasn't begun until it's trained — and advances
 * with wall time in 7-day weeks, so skipped days don't stall it. Null when the
 * sheet doesn't declare a cycle ({@link RoutineSheet.mesoWeeks} absent); week 1
 * when a cycle is declared but never run.
 */
export function mesoStatus(
  sheet: Pick<RoutineSheet, "id" | "mesoWeeks">,
  sessions: readonly TrainingSession[],
  now: Date = new Date(),
): MesoStatus | null {
  const ofWeeks = sheet.mesoWeeks ?? 0;
  if (ofWeeks < 1) return null;
  const runs = sessionsForSheet(sheet.id, sessions); // newest first
  const firstRun = runs[runs.length - 1];
  if (!firstRun) return { week: 1, ofWeeks, complete: false };
  const startMs = new Date(firstRun.startedAt).getTime();
  if (!Number.isFinite(startMs)) return { week: 1, ofWeeks, complete: false };
  const week = Math.floor(Math.max(0, now.getTime() - startMs) / WEEK_MS) + 1;
  if (week > ofWeeks) return { week: ofWeeks, ofWeeks, complete: true };
  return { week, ofWeeks, complete: false };
}

/**
 * Compact relative time like "3d ago" / "2w ago". Used by the train-list
 * adherence line where space is tight; `formatSessionDate` is still the right
 * choice for headlines.
 */
export function formatRelativeAgo(iso: string, now: Date = new Date()): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const sec = Math.max(0, Math.floor((now.getTime() - ts) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
