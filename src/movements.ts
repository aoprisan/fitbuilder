import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLE_GROUPS,
  type Equipment,
  type MuscleGroup,
} from "./types";

/**
 * Exercise catalog.
 *
 * A movement is a named exercise with a *primary* muscle and any *secondary*
 * muscles a compound lift also taxes (bench press → chest + triceps + shoulders).
 * The live "select" screen lists movements for the chosen muscle; the picked
 * movement becomes a LoggedExercise's identity (`exerciseId`), load type
 * (`equipment`, which drives the kg dial), and secondary-muscle credit.
 *
 * Generic-gear movements (Dumbbell/Barbell/Cable/…) carry an id of
 * `"${muscle}::${equipment}"` so they coincide with the legacy stats key — a
 * log made before the catalog existed keeps its progress series unbroken.
 */
export interface Movement {
  /** Stable identity, e.g. "incline-bench-press" or "chest::dumbbell". */
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: readonly MuscleGroup[];
  /** Load type — reused as the LoggedExercise equipment. */
  equipment: Equipment;
}

/** Share of a set's volume/time/effort credited to each secondary muscle. */
export const SECONDARY_MUSCLE_SHARE = 0.5;

/** A generic-gear movement: just "this muscle, loaded with this gear". */
function genericMovement(muscle: MuscleGroup, equipment: Equipment): Movement {
  return {
    id: `${muscle}::${equipment}`,
    name: EQUIPMENT_LABELS[equipment],
    primaryMuscle: muscle,
    secondaryMuscles: [],
    equipment,
  };
}

/** Curated, named movements per muscle group. Only chest is curated for now. */
const CURATED: Partial<Record<MuscleGroup, readonly Movement[]>> = {
  chest: [
    { id: "bench-press", name: "Bench Press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], equipment: "barbell" },
    { id: "incline-bench-press", name: "Incline Bench Press", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], equipment: "barbell" },
    { id: "dips", name: "Dips", primaryMuscle: "chest", secondaryMuscles: ["triceps"], equipment: "calisthenics" },
    { id: "chest-press-machine", name: "Chest Press Machine", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], equipment: "machine" },
    { id: "incline-chest-press-machine", name: "Incline Chest Press Machine", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], equipment: "machine" },
    { id: "medium-incline-chest-press-machine", name: "Vertical Bench Press Machine", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], equipment: "machine" },
    { id: "chest-fly-machine", name: "Chest Fly Machine", primaryMuscle: "chest", secondaryMuscles: [], equipment: "machine" },
    genericMovement("chest", "dumbbell"),
    genericMovement("chest", "barbell"),
    genericMovement("chest", "cable"),
  ],
};

/**
 * Movements to offer for a muscle group. Curated muscles get their named list;
 * the rest get the full generic-gear list — exactly the toggle shown today.
 */
export function movementsForMuscle(muscle: MuscleGroup): readonly Movement[] {
  return CURATED[muscle] ?? EQUIPMENT.map((eq) => genericMovement(muscle, eq));
}

const REGISTRY: ReadonlyMap<string, Movement> = new Map(
  MUSCLE_GROUPS.flatMap((m) => movementsForMuscle(m)).map((mv) => [mv.id, mv]),
);

/** Look up a movement by id, or undefined for an unknown/legacy id. */
export function findMovement(id: string): Movement | undefined {
  return REGISTRY.get(id);
}

/** Every catalog movement, deduped by id, in muscle-group then catalog order. */
export function allMovements(): readonly Movement[] {
  return [...REGISTRY.values()];
}

/**
 * Every curated compound lift, in catalog order. A movement is "compound" when
 * it taxes secondary muscles; generic-gear movements have none, so this yields
 * only the named multi-muscle lifts (today: the curated chest movements).
 */
export function compoundMovements(): readonly Movement[] {
  return MUSCLE_GROUPS.flatMap((m) => movementsForMuscle(m)).filter(
    (mv) => mv.secondaryMuscles.length > 0,
  );
}

/** A muscle's normalized share of a movement's work, as a whole-number percent. */
export interface MuscleShare {
  muscle: MuscleGroup;
  pct: number;
}

/**
 * How a movement's work splits across the muscles it taxes, as percentages that
 * sum to 100. Mirrors the breakdown weighting: the primary muscle takes full
 * credit and each secondary takes `SECONDARY_MUSCLE_SHARE`. Rounding remainder
 * is folded into the primary so the parts always total 100.
 */
export function muscleShares(mv: Movement): MuscleShare[] {
  const total = 1 + SECONDARY_MUSCLE_SHARE * mv.secondaryMuscles.length;
  const secondaries = mv.secondaryMuscles.map((muscle) => ({
    muscle,
    pct: Math.round((SECONDARY_MUSCLE_SHARE / total) * 100),
  }));
  const secondarySum = secondaries.reduce((a, s) => a + s.pct, 0);
  return [{ muscle: mv.primaryMuscle, pct: 100 - secondarySum }, ...secondaries];
}
