import { flattenSheet } from "./execute";
import type { Movement } from "./movements";
import {
  EQUIPMENT_LABELS,
  LOG_SCHEMA_ID,
  LOG_SCHEMA_VERSION,
  MUSCLE_LABELS,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type RoutineSheet,
  type TrainingSession,
  type WorkSet,
} from "./types";
import { formatSessionDate, uuid } from "./util";

/**
 * Estimated one-rep max for a single set via the Epley formula
 * (1RM ≈ w · (1 + reps/30); equals the load itself at one rep). Zero for a set
 * with no external load, where the estimate is meaningless — bodyweight
 * movements record only added weight.
 */
export function epleyOneRm(set: WorkSet): number {
  if (set.weightKg <= 0 || set.reps <= 0) return 0;
  return set.weightKg * (1 + set.reps / 30);
}

/** Best estimated one-rep max across an exercise's sets; 0 when none qualify. */
export function estimatedOneRm(sets: readonly WorkSet[]): number {
  return sets.reduce((best, s) => Math.max(best, epleyOneRm(s)), 0);
}

/** A fresh, empty session stamped with the current time. */
export function newTrainingSession(): TrainingSession {
  const now = new Date();
  const iso = now.toISOString();
  return {
    schema: LOG_SCHEMA_ID,
    version: LOG_SCHEMA_VERSION,
    id: uuid(),
    name: formatSessionDate(iso),
    startedAt: iso,
    exercises: [],
    updatedAt: iso,
  };
}

/** A new logged exercise built from a catalog movement. */
export function newLoggedExercise(movement: Movement): LoggedExercise {
  return {
    name: movement.name,
    muscle: movement.primaryMuscle,
    equipment: movement.equipment,
    exerciseId: movement.id,
    ...(movement.secondaryMuscles.length > 0
      ? { secondaryMuscles: [...movement.secondaryMuscles] }
      : {}),
    sets: [],
  };
}

/**
 * A fresh session pre-loaded with another session's exercises but no logged
 * sets — a "do it again" template you re-log live, starting from the same plan.
 */
export function repeatSession(src: TrainingSession): TrainingSession {
  const base = newTrainingSession();
  return {
    ...base,
    name: src.name,
    exercises: src.exercises.map((ex) => ({
      name: ex.name,
      muscle: ex.muscle,
      equipment: ex.equipment,
      ...(ex.exerciseId !== undefined ? { exerciseId: ex.exerciseId } : {}),
      ...(ex.secondaryMuscles !== undefined ? { secondaryMuscles: [...ex.secondaryMuscles] } : {}),
      ...(ex.prescription !== undefined ? { prescription: ex.prescription } : {}),
      sets: [],
    })),
  };
}

const ROUTINE_DEFAULT_MUSCLE: MuscleGroup = "chest";
// Bundled routines are bodyweight, so calisthenics is the least-wrong default;
// the user confirms/adjusts gear per exercise on the live "select" screen.
const ROUTINE_DEFAULT_EQUIPMENT: Equipment = "calisthenics";

/**
 * A fresh live session pre-loaded from a routine sheet: one planned exercise per
 * flattened row, no sets logged yet, each carrying its free-text prescription as
 * a live target. Gear defaults are placeholders the user confirms while logging.
 */
export function sheetToSession(sheet: RoutineSheet): TrainingSession {
  const base = newTrainingSession();
  return {
    ...base,
    name: sheet.name || base.name,
    exercises: flattenSheet(sheet).map((item) => ({
      name:
        item.name ||
        `${MUSCLE_LABELS[ROUTINE_DEFAULT_MUSCLE]} · ${EQUIPMENT_LABELS[ROUTINE_DEFAULT_EQUIPMENT]}`,
      muscle: ROUTINE_DEFAULT_MUSCLE,
      equipment: ROUTINE_DEFAULT_EQUIPMENT,
      ...(item.prescription.trim() !== "" ? { prescription: item.prescription } : {}),
      sets: [],
    })),
  };
}
