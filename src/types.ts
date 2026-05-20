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
