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

/** A blank exercise used by the builder's "add exercise" action. */
export function blankExercise(): Exercise {
  return { name: "New Exercise", equipment: "dumbbell", sets: [{ reps: 10, weightKg: 10 }] };
}
