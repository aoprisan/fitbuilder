export type Equipment =
  | "cable"
  | "dumbbell"
  | "barbell"
  | "kettlebell"
  | "trx"
  | "calisthenics";

export interface WorkSet {
  reps: number;
  /** External load in kg. For bodyweight equipment this is *added* weight (0 = bodyweight only). */
  weightKg: number;
  /** Seconds the set took, recorded by the live stopwatch. Absent for planned sets. */
  durationSec?: number;
}

export interface Exercise {
  name: string;
  equipment: Equipment;
  sets: WorkSet[];
}

export interface ExercisePlan {
  schema: "gymlog.exercise-plan";
  version: 1;
  /** uuid; regenerated on import if missing or blank. */
  id: string;
  /** e.g. "Shoulders" */
  name: string;
  /** configurable rest between sets, in seconds. */
  restSec: number;
  exercises: Exercise[];
  /** ISO timestamp of last save. */
  updatedAt?: string;
}

export const SCHEMA_ID = "gymlog.exercise-plan" as const;
export const SCHEMA_VERSION = 1 as const;

export const EQUIPMENT: readonly Equipment[] = [
  "cable",
  "dumbbell",
  "barbell",
  "kettlebell",
  "trx",
  "calisthenics",
] as const;

/** Human-readable label for each equipment type. */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  cable: "Cable",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  kettlebell: "Kettlebell",
  trx: "TRX",
  calisthenics: "Calisthenics",
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
  muscle: MuscleGroup;
  equipment: Equipment;
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
  /** ISO timestamp of last save. */
  updatedAt?: string;
}

export const LOG_SCHEMA_ID = "gymlog.training-session" as const;
export const LOG_SCHEMA_VERSION = 1 as const;
