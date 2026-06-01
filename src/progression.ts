import { exerciseKey, exerciseKeyLabel, type ExerciseKey } from "./stats";
import { findMovement } from "./movements";
import { MUSCLE_LABELS, type MuscleGroup, type TrainingSession, type WorkSet } from "./types";
import { clamp, formatSessionDate, round2 } from "./util";

/**
 * Hypertrophy progression heuristic — "what should next session look like?".
 *
 * A single-exercise read that turns the movement's recent history into a
 * concrete target for the next session (sets, reps, load and proximity to
 * failure), plus a prompt that hands the same history to Claude for a richer,
 * coached suggestion. The numbers follow textbook *double progression* tuned
 * for growth: cycle reps up within a window at a fixed load, then bank the gain
 * as a small load bump and rebuild from the bottom — all kept near failure
 * (low RIR), where the hypertrophy stimulus lives.
 */

// The 6–20 window is the muscle-building rep range (mirrors stats.ts); a target
// brackets a tighter ~4-rep band inside it, anchored to where the user trains.
const REP_FLOOR = 6;
const REP_CEILING = 20;
const REP_BAND = 4;
// Per-exercise working-set volume: below the floor we add volume before load,
// and we never prescribe runaway set counts off one heuristic.
const MIN_WORKING_SETS = 3;
const MAX_WORKING_SETS = 5;
// Hypertrophy lives close to (but rarely at) failure — 1–2 reps in reserve.
const TARGET_RIR = { min: 1, max: 2 } as const;

/** Which lever the heuristic advances: add load, add reps, add a set, or (bodyweight) load up. */
export type ProgressionMove = "load" | "reps" | "sets" | "add-load";

/** A concrete, growth-oriented prescription for the next session of one movement. */
export interface HypertrophyTarget {
  /** The progression lever this target advances. */
  move: ProgressionMove;
  /** Working sets to perform. */
  sets: number;
  /** Target reps on every working set. */
  reps: number;
  /** Working load, kg (0 = bodyweight / unknown). */
  weightKg: number;
  /** Load added vs. last time when {@link move} is "load", kg (0 otherwise). */
  loadStepKg: number;
  /** The double-progression rep window this target cycles within. */
  repWindow: { low: number; high: number };
  /** Proximity-to-failure band to train at. */
  rir: { min: number; max: number };
  /** What the last session of this movement actually looked like. */
  from: { sets: number; reps: number; weightKg: number };
}

/** A small, plausible load step ≈2.5% of the working weight: ≥1 kg, to the nearest 0.5 kg. */
function loadStep(weightKg: number): number {
  return Math.max(1, Math.round(weightKg * 0.025 * 2) / 2);
}

/** The sets logged for a movement in the most recent session it appears in. */
function lastSessionSets(sessions: TrainingSession[], key: ExerciseKey): WorkSet[] | undefined {
  const recentFirst = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const session of recentFirst) {
    const sets = session.exercises.filter((ex) => exerciseKey(ex) === key).flatMap((ex) => ex.sets);
    if (sets.length > 0) return sets;
  }
  return undefined;
}

/**
 * The next-session hypertrophy target for one movement, or `undefined` when it
 * has no logged sets. Progression is judged against the *working sets* of the
 * last session (those at its heaviest load), advancing exactly one lever:
 *
 *  1. Under {@link MIN_WORKING_SETS} sets → add a set (build volume first).
 *  2. Hit the top of the rep window on every set → add load (or, bodyweight,
 *     add external load) and rebuild from the bottom of the window.
 *  3. Otherwise → add a rep at the same load, climbing toward the window's top.
 */
export function hypertrophyTarget(
  sessions: TrainingSession[],
  key: ExerciseKey,
): HypertrophyTarget | undefined {
  const lastSets = lastSessionSets(sessions, key);
  if (!lastSets) return undefined;

  // Working load = the heaviest set last time; working sets sit at that load.
  const topWeight = lastSets.reduce((m, s) => Math.max(m, s.weightKg), 0);
  const loaded = topWeight > 0;
  const working = loaded ? lastSets.filter((s) => s.weightKg >= topWeight - 1e-9) : lastSets;
  const fromSets = working.length;
  const minReps = working.reduce((m, s) => Math.min(m, s.reps), Infinity);
  const fromReps = Number.isFinite(minReps) ? minReps : 0;

  // Rep window: bracket where the user actually trains this lift, inside the
  // 6–20 range, as a ~4-rep double-progression band.
  let maxReps = 0;
  for (const session of sessions)
    for (const ex of session.exercises)
      if (exerciseKey(ex) === key) for (const s of ex.sets) maxReps = Math.max(maxReps, s.reps);
  const high = clamp(maxReps || REP_FLOOR + REP_BAND, REP_FLOOR + 2, REP_CEILING);
  const low = Math.max(REP_FLOOR, high - REP_BAND);

  const keepSets = clamp(fromSets, MIN_WORKING_SETS, MAX_WORKING_SETS);
  const base = {
    repWindow: { low, high },
    rir: { ...TARGET_RIR },
    from: { sets: fromSets, reps: fromReps, weightKg: round2(topWeight) },
  };

  // 1) Too little volume → add a working set before chasing reps or load.
  if (fromSets < MIN_WORKING_SETS) {
    return {
      ...base,
      move: "sets",
      sets: fromSets + 1,
      reps: clamp(fromReps || low, low, high),
      weightKg: round2(topWeight),
      loadStepKg: 0,
    };
  }

  // 2) Top of the rep window on every set → bank the gain as load and reset reps.
  if (fromReps >= high) {
    if (loaded) {
      const step = loadStep(topWeight);
      return { ...base, move: "load", sets: keepSets, reps: low, weightKg: round2(topWeight + step), loadStepKg: step };
    }
    return { ...base, move: "add-load", sets: keepSets, reps: low, weightKg: 0, loadStepKg: 0 };
  }

  // 3) Otherwise add a rep at the same load, toward the top of the window.
  return {
    ...base,
    move: "reps",
    sets: keepSets,
    reps: clamp(fromReps + 1, low, high),
    weightKg: round2(topWeight),
    loadStepKg: 0,
  };
}

/** Compact English label for a target, e.g. "3 sets × 10 reps @ 42.5 kg" (prompt use only). */
export function formatTargetLine(t: HypertrophyTarget): string {
  const load = t.weightKg > 0 ? `@ ${round2(t.weightKg)} kg` : "(bodyweight)";
  return `${t.sets} sets × ${t.reps} reps ${load}`;
}

// How many recent sessions of each movement to include in the prompt: a deep
// history for the target movement itself, a shallower one for each sibling
// movement that shares a muscle (enough to gauge total volume without bloat).
const TARGET_HISTORY_SESSIONS = 12;
const MUSCLE_CONTEXT_SESSIONS = 4;

/** Recent per-exercise history as compact markdown lines, oldest → newest (last `limit`). */
function exerciseHistoryLines(
  sessions: TrainingSession[],
  key: ExerciseKey,
  limit: number,
): string[] {
  const ordered = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const lines: string[] = [];
  for (const session of ordered) {
    const sets = session.exercises.filter((ex) => exerciseKey(ex) === key).flatMap((ex) => ex.sets);
    if (sets.length === 0) continue;
    const parts = sets.map((s) => {
      const load = s.weightKg > 0 ? `${round2(s.weightKg)}kg` : "BW";
      const rir = s.rir !== undefined ? ` (RIR ${s.rir})` : "";
      return `${s.reps}×${load}${rir}`;
    });
    lines.push(`- ${formatSessionDate(session.startedAt)}: ${parts.join(", ")}`);
  }
  return limit > 0 && lines.length > limit ? lines.slice(-limit) : lines;
}

/** The muscles a movement key trains: primary first, then any secondaries. */
function keyMuscles(key: ExerciseKey): MuscleGroup[] {
  if (key.includes("::")) {
    const muscle = key.split("::")[0];
    return muscle ? [muscle as MuscleGroup] : [];
  }
  const mv = findMovement(key);
  return mv ? [mv.primaryMuscle, ...mv.secondaryMuscles] : [];
}

/**
 * Recent history of the *other* movements that share a muscle with the target,
 * grouped by muscle (primary first). Gives the coach the total-volume and
 * recovery picture for the muscle — not just the one lift. Each sibling movement
 * is printed once (under the first muscle it matches) and capped to its most
 * recent sessions so the prompt stays bounded.
 */
function muscleHistorySections(sessions: TrainingSession[], targetKey: ExerciseKey): string[] {
  const muscles = keyMuscles(targetKey);
  if (muscles.length === 0) return [];

  const lines: string[] = [];
  const seen = new Set<ExerciseKey>([targetKey]);
  for (const muscle of muscles) {
    const keys = new Set<ExerciseKey>();
    for (const session of sessions) {
      for (const ex of session.exercises) {
        if (ex.sets.length === 0) continue;
        const trains = ex.muscle === muscle || (ex.secondaryMuscles ?? []).includes(muscle);
        if (!trains) continue;
        const key = exerciseKey(ex);
        if (!seen.has(key)) keys.add(key);
      }
    }
    if (keys.size === 0) continue;
    lines.push("", `Other ${MUSCLE_LABELS[muscle]} work (for total muscle volume & recovery):`);
    for (const key of [...keys].sort()) {
      seen.add(key);
      lines.push(`${exerciseKeyLabel(key)}:`);
      for (const line of exerciseHistoryLines(sessions, key, MUSCLE_CONTEXT_SESSIONS)) {
        lines.push(`  ${line}`);
      }
    }
  }
  return lines;
}

/**
 * A focused prompt asking an AI coach to design the next hypertrophy session for
 * one movement, given its logged history and (optionally) the heuristic's own
 * suggestion as a reference. Plain text — handed off via the existing share/copy
 * flow, exactly like the plan-building and analysis prompts.
 */
export function buildHypertrophyPrompt(
  sessions: TrainingSession[],
  key: ExerciseKey,
  target?: HypertrophyTarget,
): string {
  const history = exerciseHistoryLines(sessions, key, TARGET_HISTORY_SESSIONS);
  const muscleSections = muscleHistorySections(sessions, key);
  const lines: string[] = [
    "You are an experienced strength & hypertrophy coach.",
    "Using my recent training history for ONE exercise below, design my NEXT session for that exercise to best drive muscle growth (hypertrophy).",
    "",
    `Exercise: ${exerciseKeyLabel(key)}`,
    "",
    "Recent sessions (oldest → newest), each set written as reps×load:",
    ...(history.length > 0 ? history : ["- (no sets logged yet)"]),
  ];
  if (target) {
    lines.push(
      "",
      `For reference, a simple double-progression heuristic suggests: ${formatTargetLine(target)}, training at ${target.rir.min}–${target.rir.max} reps in reserve.`,
    );
  }
  if (muscleSections.length > 0) {
    lines.push(
      ...muscleSections,
      "",
      "Use the same-muscle work above to keep total weekly volume and recovery balanced.",
    );
  }
  lines.push(
    "",
    "Please reply with:",
    "1. Target sets × reps × load for the next session.",
    "2. Target proximity to failure (reps in reserve).",
    "3. When to progress load next, and a one-line rationale.",
    "Keep weekly volume in the productive ~10–20 hard-sets-per-muscle range in mind. Be specific and concise.",
  );
  return lines.join("\n");
}
