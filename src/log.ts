import type { Movement } from "./movements";
import {
  LOG_SCHEMA_ID,
  LOG_SCHEMA_VERSION,
  type LoggedExercise,
  type TrainingSession,
} from "./types";
import { cloneTarget, formatSessionDate, uuid } from "./util";

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
      ...(ex.target !== undefined ? { target: cloneTarget(ex.target) } : {}),
      ...(ex.section !== undefined ? { section: ex.section } : {}),
      ...(ex.supersetGroup !== undefined ? { supersetGroup: ex.supersetGroup } : {}),
      sets: [],
    })),
  };
}

