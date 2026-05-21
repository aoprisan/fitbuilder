import { SCHEMA_ID, SCHEMA_VERSION, type Exercise, type ExercisePlan } from "./types";
import { uuid } from "./util";

function makeSets(count: number, reps: number, weightKg: number) {
  return Array.from({ length: count }, () => ({ reps, weightKg }));
}

/** The plan seeded on first run. */
export function defaultPlan(): ExercisePlan {
  const exercises: Exercise[] = [
    { name: "Shoulder Press", equipment: "dumbbell", sets: makeSets(3, 10, 12) },
    { name: "Lateral Raise", equipment: "dumbbell", sets: makeSets(3, 12, 6) },
    { name: "Rear Delt Fly", equipment: "cable", sets: makeSets(3, 15, 5) },
  ];
  return {
    schema: SCHEMA_ID,
    version: SCHEMA_VERSION,
    id: uuid(),
    name: "Shoulders",
    restSec: 90,
    exercises,
    updatedAt: new Date().toISOString(),
  };
}

/** Stable id for the bundled biceps plan, so re-seeding it is idempotent. */
export const BICEPS_PLAN_ID = "seed-biceps" as const;

/**
 * The second bundled plan: a straightforward biceps day. Seeded once alongside
 * the default "Shoulders" plan and carries a fixed, older timestamp so it lands
 * as the second plan in the list rather than jumping ahead of Shoulders.
 */
export function defaultBicepsPlan(): ExercisePlan {
  const exercises: Exercise[] = [
    { name: "Barbell Curl", equipment: "barbell", sets: makeSets(3, 10, 20) },
    { name: "Dumbbell Curl", equipment: "dumbbell", sets: makeSets(3, 12, 10) },
    { name: "Hammer Curl", equipment: "dumbbell", sets: makeSets(3, 12, 8) },
    { name: "Cable Curl", equipment: "cable", sets: makeSets(3, 15, 15) },
  ];
  return {
    schema: SCHEMA_ID,
    version: SCHEMA_VERSION,
    id: BICEPS_PLAN_ID,
    name: "Biceps",
    restSec: 75,
    exercises,
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

/** A fresh, empty plan for the "New plan" action. */
export function blankPlan(): ExercisePlan {
  return {
    schema: SCHEMA_ID,
    version: SCHEMA_VERSION,
    id: uuid(),
    name: "New Plan",
    restSec: 90,
    exercises: [blankExercise()],
    updatedAt: new Date().toISOString(),
  };
}

/** A blank exercise used by the builder's "add exercise" action. */
export function blankExercise(): Exercise {
  return { name: "New Exercise", equipment: "dumbbell", sets: [{ reps: 10, weightKg: 10 }] };
}
