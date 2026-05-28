import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  SHEET_SCHEMA_ID,
  SHEET_SCHEMA_VERSION,
  type Equipment,
  type MuscleGroup,
  type Routine,
  type RoutineExercise,
  type RoutineSheet,
  type SetTarget,
} from "./types";
import { uuid } from "./util";

/** Thrown when input cannot be parsed into a valid RoutineSheet. */
export class SheetValidationError extends Error {
  override name = "SheetValidationError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new SheetValidationError(message);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A single per-set target, or null if it can't be read as one (dropped). */
function validateSetTarget(value: unknown): SetTarget | null {
  if (!isRecord(value)) return null;
  const reps = value["reps"];
  if (typeof reps !== "number" || !Number.isFinite(reps) || reps <= 0) return null;
  const loadKg = value["loadKg"];
  return {
    reps: Math.floor(reps),
    ...(typeof loadKg === "number" && Number.isFinite(loadKg) && loadKg > 0 ? { loadKg } : {}),
  };
}

function asMuscle(value: unknown): MuscleGroup | undefined {
  return typeof value === "string" && (MUSCLE_GROUPS as readonly string[]).includes(value)
    ? (value as MuscleGroup)
    : undefined;
}

function asEquipment(value: unknown): Equipment | undefined {
  return typeof value === "string" && (EQUIPMENT as readonly string[]).includes(value)
    ? (value as Equipment)
    : undefined;
}

function asSecondaryMuscles(value: unknown): readonly MuscleGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is MuscleGroup =>
      typeof m === "string" && (MUSCLE_GROUPS as readonly string[]).includes(m),
  );
}

function validateExercise(value: unknown): RoutineExercise {
  if (!isRecord(value)) fail("Each exercise must be an object.");
  const rawTargets = value["setTargets"];
  const setTargets = Array.isArray(rawTargets)
    ? rawTargets.map(validateSetTarget).filter((t): t is SetTarget => t !== null)
    : [];
  const prescription = asString(value["prescription"]);
  const exerciseId = value["exerciseId"];
  const muscle = asMuscle(value["muscle"]);
  const equipment = asEquipment(value["equipment"]);
  const secondary = asSecondaryMuscles(value["secondaryMuscles"]);
  return {
    name: asString(value["name"]),
    ...(prescription !== "" ? { prescription } : {}),
    ...(setTargets.length > 0 ? { setTargets } : {}),
    ...(typeof exerciseId === "string" && exerciseId !== "" ? { exerciseId } : {}),
    ...(muscle !== undefined ? { muscle } : {}),
    ...(equipment !== undefined ? { equipment } : {}),
    ...(secondary.length > 0 ? { secondaryMuscles: secondary } : {}),
  };
}

function validateRoutine(value: unknown): Routine {
  if (!isRecord(value)) fail("Each routine must be an object.");
  const rawTags = value["tags"];
  const tags = Array.isArray(rawTags) ? rawTags.map(asString).filter((t) => t !== "") : [];
  const rawEx = value["exercises"];
  const exercises = Array.isArray(rawEx) ? rawEx.map(validateExercise) : [];
  return { title: asString(value["title"]), tags, exercises };
}

/**
 * Parse arbitrary input into a valid RoutineSheet. Text fields are coerced to
 * strings rather than rejected, so partially-filled sheets always round-trip.
 * A missing/blank `id` is regenerated.
 */
export function validateSheet(input: unknown): RoutineSheet {
  if (!isRecord(input)) fail("Sheet must be a JSON object.");
  if (input["schema"] !== SHEET_SCHEMA_ID) {
    fail(`Unsupported schema: expected "${SHEET_SCHEMA_ID}".`);
  }
  if (input["version"] !== SHEET_SCHEMA_VERSION) {
    fail(`Unsupported version: expected ${SHEET_SCHEMA_VERSION}.`);
  }

  const name = input["name"];
  if (typeof name !== "string" || name.trim() === "") {
    fail("Sheet name must be a non-empty string.");
  }

  const routines = input["routines"];
  if (!Array.isArray(routines)) fail("Sheet routines must be an array.");

  const rawId = input["id"];
  const id = typeof rawId === "string" && rawId.trim() !== "" ? rawId : uuid();
  const updatedAt = input["updatedAt"];

  return {
    schema: SHEET_SCHEMA_ID,
    version: SHEET_SCHEMA_VERSION,
    id,
    name,
    routines: routines.map(validateRoutine),
    ...(typeof updatedAt === "string" ? { updatedAt } : {}),
  };
}
