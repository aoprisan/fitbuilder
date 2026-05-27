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

function coerceSet(value: unknown): WorkSet {
  if (!isRecord(value)) return { reps: 0, weightKg: 0 };
  const reps = coerceNonNegative(value["reps"]);
  const weightKg = coerceNonNegative(value["weightKg"]);
  const dur = value["durationSec"];
  const rir = value["rir"];
  return {
    reps,
    weightKg,
    ...(typeof dur === "number" && Number.isFinite(dur) && dur >= 0 ? { durationSec: dur } : {}),
    ...(typeof rir === "number" && Number.isFinite(rir) && rir >= 0 ? { rir } : {}),
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

  return {
    schema: LOG_SCHEMA_ID,
    version: LOG_SCHEMA_VERSION,
    id,
    name: typeof input["name"] === "string" ? input["name"] : "",
    startedAt,
    exercises,
    ...(typeof updatedAt === "string" ? { updatedAt } : {}),
  };
}
