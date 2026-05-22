import {
  LOG_SCHEMA_ID,
  LOG_SCHEMA_VERSION,
  type LoggedExercise,
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

/** A blank exercise for the log's "add exercise" action. */
export function blankLogExercise(): LoggedExercise {
  return { name: "", muscle: "chest", equipment: "dumbbell", sets: [{ reps: 10, weightKg: 10 }] };
}
