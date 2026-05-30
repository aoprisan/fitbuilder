import { EQUIPMENT, MUSCLE_GROUPS, type Equipment, type MuscleGroup } from "./types";

const KEY = "gymlog.liveProgress";

/** Top-level place in the live flow worth resuming (the "list" screen is the default, so it isn't stored). */
export type ProgressStage = "select" | "exercise";
/** Where we are within a single exercise. */
export type ProgressSub = "idle" | "running" | "logging" | "resting";

/** Which exercise-picker mode the select screen is showing. */
export type SelectMode = "custom" | "compound";

const STAGES: readonly ProgressStage[] = ["select", "exercise"];
const SUBS: readonly ProgressSub[] = ["idle", "running", "logging", "resting"];
const SELECT_MODES: readonly SelectMode[] = ["custom", "compound"];

/**
 * A snapshot of an in-flight live session: which session is open, where the
 * user sits in the guided flow, the pending set values, and the live timers.
 * Persisting it lets a workout survive a reload, a phone lock, or navigating
 * away mid-set so the user resumes exactly where they left off.
 */
export interface LiveProgress {
  sessionId: string;
  stage: ProgressStage;
  sub: ProgressSub;
  muscle: MuscleGroup;
  equipment: Equipment;
  /** Selected catalog movement id; re-validated against the muscle's catalog on restore. */
  movementId: string;
  /** Which exercise-picker mode the select screen is showing. */
  selectMode: SelectMode;
  /** True when the session's last exercise is the one being worked (sets already logged for it). */
  hasCurrentEx: boolean;
  /** In-flight reps/weight while logging a set. */
  setReps: number;
  setWeight: number;
  /** In-flight cardio values while logging a treadmill bout (distance km / speed km/h / incline %). */
  setDistanceKm: number;
  setSpeedKmh: number;
  setInclinePct: number;
  /** In-flight reps-in-reserve for the set being logged; null when not chosen. */
  setRir: number | null;
  /** Epoch ms when the running set started (sub === "running"); 0 otherwise. */
  setStartEpoch: number;
  /** Set duration captured at stop, in ms (sub === "logging"); 0 otherwise. */
  setElapsedMs: number;
  /** Epoch ms when the rest clock started (sub === "resting"); 0 otherwise. */
  restStartEpoch: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Store the current live-flow snapshot. Silently no-ops if storage is unavailable. */
export function saveProgress(progress: LiveProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Quota or privacy-mode failure: progress just won't be resumable.
  }
}

/** Forget any saved live-flow snapshot (session ended or nothing in flight). */
export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore — nothing else to do.
  }
}

/**
 * Read the saved live-flow snapshot, repairing or rejecting malformed data.
 * Returns null when there is nothing resumable (no marker, or a missing id).
 */
export function loadProgress(): LiveProgress | null {
  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (text === null) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;

  const sessionId = raw["sessionId"];
  if (typeof sessionId !== "string" || sessionId.trim() === "") return null;

  const stage = STAGES.includes(raw["stage"] as ProgressStage)
    ? (raw["stage"] as ProgressStage)
    : "select";
  const sub = SUBS.includes(raw["sub"] as ProgressSub) ? (raw["sub"] as ProgressSub) : "idle";
  const muscle = (MUSCLE_GROUPS as readonly string[]).includes(raw["muscle"] as string)
    ? (raw["muscle"] as MuscleGroup)
    : "chest";
  const equipment = (EQUIPMENT as readonly string[]).includes(raw["equipment"] as string)
    ? (raw["equipment"] as Equipment)
    : "dumbbell";
  const movementId = typeof raw["movementId"] === "string" ? raw["movementId"] : "";
  const selectMode = SELECT_MODES.includes(raw["selectMode"] as SelectMode)
    ? (raw["selectMode"] as SelectMode)
    : "custom";
  const rawRir = raw["setRir"];
  const setRir =
    typeof rawRir === "number" && Number.isFinite(rawRir) && rawRir >= 0 ? rawRir : null;

  return {
    sessionId,
    stage,
    sub,
    muscle,
    equipment,
    movementId,
    selectMode,
    hasCurrentEx: raw["hasCurrentEx"] === true,
    setReps: num(raw["setReps"]),
    setWeight: num(raw["setWeight"]),
    setDistanceKm: num(raw["setDistanceKm"]),
    setSpeedKmh: num(raw["setSpeedKmh"]),
    setInclinePct: num(raw["setInclinePct"]),
    setRir,
    setStartEpoch: num(raw["setStartEpoch"]),
    setElapsedMs: num(raw["setElapsedMs"]),
    restStartEpoch: num(raw["restStartEpoch"]),
  };
}
