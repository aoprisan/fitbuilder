import { flattenSheet } from "./execute";
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
