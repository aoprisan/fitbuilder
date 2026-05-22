import {
  EQUIPMENT_LABELS,
  LOG_SCHEMA_ID,
  LOG_SCHEMA_VERSION,
  MUSCLE_LABELS,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
} from "./types";
import { formatSessionDate, uuid } from "./util";

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

/** A new logged exercise, labelled from its muscle group and equipment. */
export function newLoggedExercise(muscle: MuscleGroup, equipment: Equipment): LoggedExercise {
  return {
    name: `${MUSCLE_LABELS[muscle]} · ${EQUIPMENT_LABELS[equipment]}`,
    muscle,
    equipment,
    sets: [],
  };
}
