import { type ExecuteController, flattenSheet } from "./execute";
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
    ...(sheet.id !== "" ? { fromSheetId: sheet.id } : {}),
    exercises: flattenSheet(sheet).map((item) => {
      // Prefer the carried catalog identity (set by the builder/importer or by
      // flattenSheet's name-match); fall back to bodyweight placeholders the
      // user confirms on the live "select" screen.
      const muscle = item.muscle ?? ROUTINE_DEFAULT_MUSCLE;
      const equipment = item.equipment ?? ROUTINE_DEFAULT_EQUIPMENT;
      return {
        name:
          item.name ||
          `${MUSCLE_LABELS[muscle]} · ${EQUIPMENT_LABELS[equipment]}`,
        muscle,
        equipment,
        ...(item.exerciseId !== undefined ? { exerciseId: item.exerciseId } : {}),
        ...(item.secondaryMuscles && item.secondaryMuscles.length > 0
          ? { secondaryMuscles: [...item.secondaryMuscles] }
          : {}),
        ...(item.prescription.trim() !== "" ? { prescription: item.prescription } : {}),
        sets: [],
      };
    }),
  };
}

/**
 * Turn a finished or partial Execute run into a saveable training session, so
 * the work logged while following a routine feeds the same effort / recovery /
 * stats pipeline as a live session. Only rows with at least one recorded set are
 * carried (untouched rows don't inflate the log); each keeps its routine
 * prescription and the muscle / load identity the run resolved for it. Stamped
 * `source: "routine"` to set it apart from a live log.
 */
export function executeRunToSession(
  ctl: ExecuteController,
  name: string,
  opts?: { fromSheetId?: string },
): TrainingSession {
  const base = newTrainingSession();
  const exercises: LoggedExercise[] = [];
  ctl.items.forEach((item, i) => {
    const sets = ctl.workSets(i);
    const meta = ctl.exercise(i);
    if (sets.length === 0 || !meta) return;
    exercises.push({
      name:
        item.name.trim() ||
        `${MUSCLE_LABELS[meta.muscle]} · ${EQUIPMENT_LABELS[meta.equipment]}`,
      muscle: meta.muscle,
      equipment: meta.equipment,
      ...(meta.exerciseId !== undefined ? { exerciseId: meta.exerciseId } : {}),
      ...(meta.secondaryMuscles && meta.secondaryMuscles.length > 0
        ? { secondaryMuscles: [...meta.secondaryMuscles] }
        : {}),
      ...(item.prescription.trim() !== "" ? { prescription: item.prescription } : {}),
      sets: sets.map((s) => ({ ...s })),
    });
  });
  const fromSheetId = opts?.fromSheetId;
  return {
    ...base,
    name: name.trim() || base.name,
    source: "routine",
    ...(typeof fromSheetId === "string" && fromSheetId !== "" ? { fromSheetId } : {}),
    exercises,
  };
}
