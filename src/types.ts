export type Equipment =
  | "cable"
  | "dumbbell"
  | "barbell"
  | "kettlebell"
  | "trx"
  | "calisthenics"
  | "machine"
  | "triceps-press"
  | "bench-press"
  | "lat-pulldown"
  | "rear-delt-fly"
  | "lateral-raise"
  | "lateral-abs-machine";

export interface WorkSet {
  reps: number;
  /** External load in kg. For bodyweight equipment this is *added* weight (0 = bodyweight only). */
  weightKg: number;
  /** Seconds the set took, recorded by the live stopwatch. */
  durationSec?: number;
  /**
   * Reps in reserve at the end of the set — proximity to failure (0 = trained to
   * failure, higher = more reps left in the tank). Optional: when absent the set
   * is treated as a typical hard working set and the intensity heuristics behave
   * exactly as before. The strongest per-set driver of both stimulus and fatigue.
   */
  rir?: number;
}

export const EQUIPMENT: readonly Equipment[] = [
  "cable",
  "dumbbell",
  "barbell",
  "kettlebell",
  "trx",
  "calisthenics",
  "machine",
  "triceps-press",
  "bench-press",
  "lat-pulldown",
  "rear-delt-fly",
  "lateral-raise",
  "lateral-abs-machine",
] as const;

/** Human-readable label for each equipment type. */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  cable: "Cable",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  kettlebell: "Kettlebell",
  trx: "TRX",
  calisthenics: "Calisthenics",
  machine: "Machine",
  "triceps-press": "Triceps Press",
  "bench-press": "Bench Press",
  "lat-pulldown": "Lat Pulldown",
  "rear-delt-fly": "Rear Delt Fly",
  "lateral-raise": "Lateral Raise",
  "lateral-abs-machine": "Lateral Abs Machine",
};

/** Equipment whose sets are bodyweight-based; any weight is *added* load. */
export const BODYWEIGHT_EQUIPMENT: readonly Equipment[] = ["trx", "calisthenics"] as const;

export function isBodyweight(equipment: Equipment): boolean {
  return (BODYWEIGHT_EQUIPMENT as readonly Equipment[]).includes(equipment);
}

/* =============================================================================
   Routine sheets — free-text, shareable training documents.
   A sheet stacks several routines (like the printed gym wall-charts); each
   exercise carries a free-text prescription ("30-50 repetari", a rep pyramid,
   "20 sec x 4/6 runde") that the structured ExercisePlan model can't express.
   Sheets are built to be exported as PNG/PDF and shared (e.g. on WhatsApp).
   ========================================================================== */

export interface RoutineExercise {
  name: string;
  /** Free-text prescription, e.g. "30-50 repetari" or "1-2-3-...-3-2-1". */
  prescription: string;
}

export interface Routine {
  /** e.g. "RUTINA IMPINS". */
  title: string;
  /** Free-text labels rendered as chips, e.g. ["INTERMEDIAR+", "PARC", "60-100 antrenamente"]. */
  tags: string[];
  exercises: RoutineExercise[];
}

export interface RoutineSheet {
  schema: "gymlog.routine-sheet";
  version: 1;
  /** uuid; regenerated on import if missing or blank. */
  id: string;
  /** Document title, e.g. "Rutina Impins — Calisthenics". */
  name: string;
  routines: Routine[];
  /** ISO timestamp of last save. */
  updatedAt?: string;
}

export const SHEET_SCHEMA_ID = "gymlog.routine-sheet" as const;
export const SHEET_SCHEMA_VERSION = 1 as const;

/* =============================================================================
   Training sessions — live workout logs.
   Unlike an ExercisePlan (a template designed ahead of time), a TrainingSession
   is a journal of an actual workout: started at a moment in time and filled in
   set-by-set at the gym. Each logged exercise tags the muscle group worked.
   ========================================================================== */

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "traps"
  | "biceps"
  | "triceps"
  | "legs"
  | "glutes"
  | "core"
  | "forearms"
  | "calves";

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "traps",
  "biceps",
  "triceps",
  "legs",
  "glutes",
  "core",
  "forearms",
  "calves",
] as const;

/** Human-readable label for each muscle group. */
export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  traps: "Traps",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  glutes: "Glutes",
  core: "Core",
  forearms: "Forearms",
  calves: "Calves",
};

export interface LoggedExercise {
  name: string;
  /** Primary muscle group worked. */
  muscle: MuscleGroup;
  /** Load type — how the set is loaded (drives the kg dial and load formatting). */
  equipment: Equipment;
  /**
   * Stable movement identity from the exercise catalog (e.g. "incline-bench-press").
   * Absent on legacy logs, which fall back to a "muscle::equipment" key.
   */
  exerciseId?: string;
  /** Muscles also worked by a compound movement, copied from the catalog at log time. */
  secondaryMuscles?: readonly MuscleGroup[];
  /** Free-text target carried from a routine (e.g. "30-50 repetari"); absent for ad-hoc exercises. */
  prescription?: string;
  /** User-logged one-rep max in kg; the calculated estimate is derived from the sets. */
  oneRmKg?: number;
  sets: WorkSet[];
}

export interface TrainingSession {
  schema: "gymlog.training-session";
  version: 1;
  /** uuid; regenerated on load if missing or blank. */
  id: string;
  /** Free-text label, e.g. "Push day". Defaults to the start date. */
  name: string;
  /** ISO timestamp of when the session was started. */
  startedAt: string;
  exercises: LoggedExercise[];
  /**
   * How the session was logged: "live" (the Live tab, set-by-set with timers) or
   * "routine" (saved from an Execute run of a routine sheet). Absent on older
   * logs and treated as "live"; lets effort calibration tell the two apart if
   * routine runs (often reps-only) start skewing the median.
   */
  source?: "live" | "routine";
  /** ISO timestamp of last save. */
  updatedAt?: string;
}

export const LOG_SCHEMA_ID = "gymlog.training-session" as const;
export const LOG_SCHEMA_VERSION = 1 as const;

/* =============================================================================
   Session archive — a self-describing bundle of every logged session, built
   for export so the data can be imported into other tools and analysed there.
   ========================================================================== */

export interface SessionArchive {
  schema: "gymlog.session-archive";
  version: 1;
  /** ISO timestamp of when the archive was exported. */
  exportedAt: string;
  /** Number of sessions in the archive. */
  count: number;
  sessions: TrainingSession[];
}

export const SESSION_ARCHIVE_SCHEMA_ID = "gymlog.session-archive" as const;
export const SESSION_ARCHIVE_SCHEMA_VERSION = 1 as const;
