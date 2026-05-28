import { parseTargetReps } from "./execute";
import type { TrainingSession } from "./types";

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

export function summarizeAdherence(
  sheetId: string,
  sessions: readonly TrainingSession[],
): AdherenceSummary {
  const own = sessions.filter((s) => s.fromSheetId === sheetId);
  if (own.length === 0) return { runs: 0 };

  let lastRunIso = own[0]!.startedAt;
  for (const s of own) if (s.startedAt > lastRunIso) lastRunIso = s.startedAt;

  const completions: number[] = [];
  for (const s of own) {
    const c = sessionCompletion(s);
    if (c !== null) completions.push(c);
  }

  return {
    runs: own.length,
    lastRunIso,
    ...(completions.length > 0
      ? {
          avgCompletionPct: Math.round(
            (completions.reduce((a, c) => a + c, 0) / completions.length) * 100,
          ),
        }
      : {}),
  };
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
