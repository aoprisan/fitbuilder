import {
  EQUIPMENT,
  SCHEMA_ID,
  SCHEMA_VERSION,
  type Equipment,
  type Exercise,
  type ExercisePlan,
  type WorkSet,
} from "./types";
import { uuid } from "./util";

/** Thrown when input cannot be parsed into a valid ExercisePlan. */
export class ValidationError extends Error {
  override name = "ValidationError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new ValidationError(message);
}

function asFiniteNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${where} must be a finite number.`);
  }
  return value;
}

function isEquipment(value: unknown): value is Equipment {
  return typeof value === "string" && (EQUIPMENT as readonly string[]).includes(value);
}

function validateSet(value: unknown, where: string): WorkSet {
  if (!isRecord(value)) fail(`${where} must be an object.`);
  const reps = asFiniteNumber(value["reps"], `${where}.reps`);
  if (reps < 0) fail(`${where}.reps must be ≥ 0.`);
  const weightKg = asFiniteNumber(value["weightKg"], `${where}.weightKg`);
  if (weightKg < 0) fail(`${where}.weightKg must be ≥ 0.`);
  return { reps, weightKg };
}

function validateExercise(value: unknown, where: string): Exercise {
  if (!isRecord(value)) fail(`${where} must be an object.`);
  const name = value["name"];
  if (typeof name !== "string" || name.trim() === "") {
    fail(`${where}.name must be a non-empty string.`);
  }
  if (!isEquipment(value["equipment"])) {
    fail(`${where}.equipment must be one of: ${EQUIPMENT.join(", ")}.`);
  }
  const sets = value["sets"];
  if (!Array.isArray(sets) || sets.length === 0) {
    fail(`${where}.sets must be a non-empty array.`);
  }
  return {
    name,
    equipment: value["equipment"],
    sets: sets.map((s, i) => validateSet(s, `${where}.sets[${i}]`)),
  };
}

/**
 * Parse and validate arbitrary input into an ExercisePlan.
 * Throws ValidationError with a human-readable message on bad input.
 * A missing/blank `id` is regenerated so imports always round-trip safely.
 */
export function validate(input: unknown): ExercisePlan {
  if (!isRecord(input)) fail("Plan must be a JSON object.");

  if (input["schema"] !== SCHEMA_ID) {
    fail(`Unsupported schema: expected "${SCHEMA_ID}".`);
  }
  if (input["version"] !== SCHEMA_VERSION) {
    fail(`Unsupported version: expected ${SCHEMA_VERSION}.`);
  }

  const name = input["name"];
  if (typeof name !== "string" || name.trim() === "") {
    fail("Plan name must be a non-empty string.");
  }

  const restSec = asFiniteNumber(input["restSec"], "restSec");
  if (restSec < 0) fail("restSec must be ≥ 0.");

  const exercises = input["exercises"];
  if (!Array.isArray(exercises) || exercises.length === 0) {
    fail("Plan must contain at least one exercise.");
  }

  const rawId = input["id"];
  const id = typeof rawId === "string" && rawId.trim() !== "" ? rawId : uuid();

  const updatedAt = input["updatedAt"];

  return {
    schema: SCHEMA_ID,
    version: SCHEMA_VERSION,
    id,
    name,
    restSec,
    exercises: exercises.map((ex, i) => validateExercise(ex, `exercises[${i}]`)),
    ...(typeof updatedAt === "string" ? { updatedAt } : {}),
  };
}

/** Parse a JSON string then validate it. Throws ValidationError on bad JSON too. */
export function parsePlanJson(text: string): ExercisePlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Invalid JSON: ${detail}`);
  }
  return validate(parsed);
}
