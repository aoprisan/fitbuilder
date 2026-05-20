export type Equipment = "cable" | "dumbbell";

export interface WorkSet {
  reps: number;
  weightKg: number;
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
export const EQUIPMENT: readonly Equipment[] = ["cable", "dumbbell"] as const;
