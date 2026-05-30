import {
  EQUIPMENT,
  LOG_SCHEMA_ID,
  LOG_SCHEMA_VERSION,
  MUSCLE_GROUPS,
  type Equipment,
  type LoggedExercise,
  type MuscleGroup,
  type TrainingSession,
  type WorkSet,
} from "./types";
import { uuid } from "./util";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceEquipment(value: unknown): Equipment {
  return typeof value === "string" && (EQUIPMENT as readonly string[]).includes(value)
    ? (value as Equipment)
    : "dumbbell";
}

function coerceMuscle(value: unknown): MuscleGroup {
  return typeof value === "string" && (MUSCLE_GROUPS as readonly string[]).includes(value)
    ? (value as MuscleGroup)
    : "chest";
}

function coerceSecondaryMuscles(value: unknown): MuscleGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (m): m is MuscleGroup =>
      typeof m === "string" && (MUSCLE_GROUPS as readonly string[]).includes(m),
  );
}

function coerceNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** A finite, non-negative number passes through; anything else drops to undefined. */
function optionalNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function coerceSet(value: unknown): WorkSet {
  if (!isRecord(value)) return { reps: 0, weightKg: 0 };
  const reps = coerceNonNegative(value["reps"]);
  const weightKg = coerceNonNegative(value["weightKg"]);
  const dur = optionalNonNegative(value["durationSec"]);
  const rir = optionalNonNegative(value["rir"]);
  const distanceKm = optionalNonNegative(value["distanceKm"]);
  const speedKmh = optionalNonNegative(value["speedKmh"]);
  const inclinePct = optionalNonNegative(value["inclinePct"]);
  return {
    reps,
    weightKg,
    ...(dur !== undefined ? { durationSec: dur } : {}),
    ...(rir !== undefined ? { rir } : {}),
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    ...(speedKmh !== undefined ? { speedKmh } : {}),
    ...(inclinePct !== undefined ? { inclinePct } : {}),
  };
}

function coerceExercise(value: unknown): LoggedExercise {
  const rec = isRecord(value) ? value : {};
  const rawSets = rec["sets"];
  const sets = Array.isArray(rawSets) ? rawSets.map(coerceSet) : [];
  const pres = rec["prescription"];
  const exerciseId = rec["exerciseId"];
  const secondary = coerceSecondaryMuscles(rec["secondaryMuscles"]);
  const oneRm = rec["oneRmKg"];
  return {
    name: typeof rec["name"] === "string" ? rec["name"] : "",
    muscle: coerceMuscle(rec["muscle"]),
    equipment: coerceEquipment(rec["equipment"]),
    ...(typeof exerciseId === "string" && exerciseId !== "" ? { exerciseId } : {}),
    ...(secondary.length > 0 ? { secondaryMuscles: secondary } : {}),
    ...(typeof pres === "string" && pres !== "" ? { prescription: pres } : {}),
    ...(typeof oneRm === "number" && Number.isFinite(oneRm) && oneRm > 0 ? { oneRmKg: oneRm } : {}),
    sets,
  };
}

/**
 * Coerce arbitrary stored input into a TrainingSession. Unlike the plan
 * validator this never throws: training logs are first-party local data, so we
 * repair (default muscle/equipment, drop bad fields) rather than discard a
 * whole workout. Returns null only when the schema marker is absent/wrong.
 */
export function coerceSession(input: unknown): TrainingSession | null {
  if (!isRecord(input)) return null;
  if (input["schema"] !== LOG_SCHEMA_ID) return null;

  const rawId = input["id"];
  const id = typeof rawId === "string" && rawId.trim() !== "" ? rawId : uuid();

  const rawStarted = input["startedAt"];
  const startedAt =
    typeof rawStarted === "string" && rawStarted.trim() !== ""
      ? rawStarted
      : new Date().toISOString();

  const rawExercises = input["exercises"];
  const exercises = Array.isArray(rawExercises) ? rawExercises.map(coerceExercise) : [];

  const updatedAt = input["updatedAt"];
  const source = input["source"];
  const fromSheetId = input["fromSheetId"];

  return {
    schema: LOG_SCHEMA_ID,
    version: LOG_SCHEMA_VERSION,
    id,
    name: typeof input["name"] === "string" ? input["name"] : "",
    startedAt,
    exercises,
    ...(source === "live" || source === "routine" ? { source } : {}),
    ...(typeof fromSheetId === "string" && fromSheetId !== "" ? { fromSheetId } : {}),
    ...(typeof updatedAt === "string" ? { updatedAt } : {}),
  };
}
