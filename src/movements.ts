import { MUSCLE_REFERENCE_LOAD_KG } from "./loadProfile";
import {
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
  /**
   * Working-load reference in kg — roughly what this movement handles for one hard
   * working set (intermediate trainee), used to normalise its volume in the effort
   * gauge (see {@link loadCapacityFactor}). It's the "back extension ≠ deadlift"
   * knob: two movements on the same muscle can move wildly different loads, so a
   * deadlift's high reference makes each kg count *less* while a back extension's
   * low one makes each kg count *more*. Absent → fall back to the primary muscle's
   * {@link MUSCLE_REFERENCE_LOAD_KG} (the old per-muscle behaviour). Set it only
   * where a movement diverges meaningfully from its muscle baseline.
   */
  referenceLoadKg?: number;
  /**
   * Additional names that should resolve to this movement via
   * `matchMovementByName`. Used for plural/hyphen variants and Romanian
   * synonyms in the bundled seed sheets (e.g. "Flotari" → push-up). Exact-
   * match only — compound names like "Tractiuni Pronate Bara" need an explicit
   * entry, not a token-level inference.
   */
  aliases?: readonly string[];
}

/** Share of a set's volume/time/effort credited to each secondary muscle. */
export const SECONDARY_MUSCLE_SHARE = 0.5;

/**
 * The general-purpose load types offered as fallback gear for any muscle without
 * a curated movement list. Excludes the specific guided-machine classes in
 * `EQUIPMENT` (bench-press, lat-pulldown, …) — those back named curated lifts and
 * read as nonsense generic gear (e.g. "Biceps · Lateral Abs Machine").
 */
const GENERIC_EQUIPMENT: readonly Equipment[] = [
  "cable",
  "dumbbell",
  "barbell",
  "kettlebell",
  "trx",
  "calisthenics",
  "machine",
];

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

/** Curated, named movements per muscle group; the rest fall back to generic gear. */
const CURATED: Partial<Record<MuscleGroup, readonly Movement[]>> = {
  chest: [
    { id: "bench-press", name: "Bench Press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], equipment: "barbell" },
    { id: "incline-bench-press", name: "Incline Bench Press", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], equipment: "barbell" },
    { id: "larsen-press", name: "Larsen Press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], equipment: "barbell", aliases: ["Larson Press", "Legs-Up Bench Press"] },
    { id: "dips", name: "Dips", primaryMuscle: "chest", secondaryMuscles: ["triceps"], equipment: "calisthenics", aliases: ["Triceps Dips", "Straight Bar Dips"] },
    { id: "push-up", name: "Push-Up", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], equipment: "calisthenics", aliases: ["Push-Ups", "Push Ups", "Pushup", "Pushups", "Flotari", "Flotari pe Sol", "Flotari Sol"] },
    { id: "decline-push-up", name: "Decline Push-Up", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], equipment: "calisthenics", aliases: ["Decline Push-Ups", "Decline Push Ups", "Feet-Elevated Push-Up", "Flotari Inclinate", "Flotari cu Picioarele Sus"] },
    { id: "diamond-push-up", name: "Diamond Push-Up", primaryMuscle: "triceps", secondaryMuscles: ["chest", "shoulders"], equipment: "calisthenics", aliases: ["Diamond Push-Ups", "Diamond Push Ups", "Flotari Diamant"] },
    { id: "chest-press-machine", name: "Chest Press Machine", primaryMuscle: "chest", secondaryMuscles: ["triceps", "shoulders"], equipment: "machine" },
    { id: "incline-chest-press-machine", name: "Incline Chest Press Machine", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], equipment: "machine" },
    { id: "medium-incline-chest-press-machine", name: "Vertical Bench Press Machine", primaryMuscle: "chest", secondaryMuscles: ["shoulders", "triceps"], equipment: "machine" },
    { id: "chest-fly-machine", name: "Chest Fly Machine", primaryMuscle: "chest", secondaryMuscles: [], equipment: "machine" },
    genericMovement("chest", "dumbbell"),
    genericMovement("chest", "barbell"),
    genericMovement("chest", "cable"),
  ],
  back: [
    { id: "pull-up", name: "Pull-Up", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "calisthenics", aliases: ["Pull-Ups", "Pull Ups", "Tractiuni", "Tractiuni Pronate"] },
    { id: "chin-up", name: "Chin-Up", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "calisthenics", aliases: ["Chin-Ups", "Chin Ups", "Tractiuni Supinate"] },
    { id: "inverted-row", name: "Inverted Row", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "calisthenics", aliases: ["Australian Pull-Up", "Australian Pull-Ups", "Australiene", "Ramat", "Ramat Banda Elastica"] },
    { id: "muscle-up", name: "Muscle-Up", primaryMuscle: "back", secondaryMuscles: ["chest", "triceps"], equipment: "calisthenics", aliases: ["Muscle-Ups", "Muscle Up", "Muscle Ups"] },
    { id: "dead-hang", name: "Dead Hang", primaryMuscle: "forearms", secondaryMuscles: ["back"], equipment: "calisthenics", aliases: ["Dead Hangs"] },
    { id: "pronated-grip-pulldown", name: "Pronated Grip Pulldown", primaryMuscle: "back", secondaryMuscles: ["biceps", "forearms"], equipment: "lat-pulldown", aliases: ["Pronated Pulldown", "Wide Grip Pulldown", "Lat Pulldown Pronated"] },
    { id: "neutral-grip-pulldown", name: "Neutral Grip Pulldown", primaryMuscle: "back", secondaryMuscles: ["biceps", "forearms"], equipment: "lat-pulldown", aliases: ["Neutral Pulldown", "Neutral Grip Lat Pulldown", "Close Grip Pulldown"] },
    { id: "cable-row", name: "Cable Row Machine", primaryMuscle: "back", secondaryMuscles: ["biceps", "traps"], equipment: "cable", aliases: ["Cable Row", "Seated Cable Row", "Ramat la Cablu"] },
    { id: "seated-row", name: "Seated Row Machine", primaryMuscle: "back", secondaryMuscles: ["biceps", "traps"], equipment: "machine", aliases: ["Seated Row", "Row Machine", "Machine Row"] },
    genericMovement("back", "barbell"),
    genericMovement("back", "dumbbell"),
    genericMovement("back", "cable"),
    genericMovement("back", "machine"),
    genericMovement("back", "lat-pulldown"),
  ],
  "lower-back": [
    { id: "back-extension", name: "Back Extension", primaryMuscle: "lower-back", secondaryMuscles: ["glutes"], equipment: "calisthenics", referenceLoadKg: 40, aliases: ["Hyperextension", "Hyperextensions", "Superman", "Hiper Extensii", "Hiper Extensii Superman"] },
    { id: "good-morning", name: "Good Morning", primaryMuscle: "lower-back", secondaryMuscles: ["glutes", "legs"], equipment: "barbell", referenceLoadKg: 80, aliases: ["Good Mornings"] },
    { id: "back-extension-machine", name: "Back Extension Machine", primaryMuscle: "lower-back", secondaryMuscles: ["glutes"], equipment: "machine", referenceLoadKg: 90 },
    genericMovement("lower-back", "barbell"),
    genericMovement("lower-back", "machine"),
  ],
  shoulders: [
    { id: "overhead-press", name: "Overhead Press", primaryMuscle: "shoulders", secondaryMuscles: ["triceps"], equipment: "barbell", aliases: ["Shoulder Press", "Presa Umeri"] },
    { id: "pike-push-up", name: "Pike Push-Up", primaryMuscle: "shoulders", secondaryMuscles: ["triceps"], equipment: "calisthenics", aliases: ["Pike Push-Ups", "Pike Push Ups"] },
    { id: "handstand-push-up", name: "Handstand Push-Up", primaryMuscle: "shoulders", secondaryMuscles: ["triceps"], equipment: "calisthenics", aliases: ["Handstand Push-Ups", "Handstand Push Ups"] },
    genericMovement("shoulders", "dumbbell"),
    genericMovement("shoulders", "barbell"),
    genericMovement("shoulders", "cable"),
    genericMovement("shoulders", "lateral-raise"),
    genericMovement("shoulders", "rear-delt-fly"),
  ],
  biceps: [
    { id: "wall-barbell-curl", name: "Wall Barbell Curl", primaryMuscle: "biceps", secondaryMuscles: [], equipment: "barbell", aliases: ["Barbell Wall Curl", "Wall Curl", "Strict Barbell Curl"] },
    genericMovement("biceps", "dumbbell"),
    genericMovement("biceps", "barbell"),
    genericMovement("biceps", "cable"),
    genericMovement("biceps", "machine"),
  ],
  legs: [
    { id: "deadlift", name: "Deadlift", primaryMuscle: "legs", secondaryMuscles: ["glutes", "lower-back"], equipment: "barbell", referenceLoadKg: 150 },
    { id: "romanian-deadlift", name: "Romanian Deadlift", primaryMuscle: "legs", secondaryMuscles: ["glutes", "lower-back"], equipment: "barbell", referenceLoadKg: 120 },
    { id: "barbell-squat", name: "Barbell Squat", primaryMuscle: "legs", secondaryMuscles: ["glutes", "lower-back"], equipment: "barbell", referenceLoadKg: 130, aliases: ["Back Squat", "Genuflexiuni cu Bara"] },
    { id: "dumbbell-squat", name: "Dumbbell Squat", primaryMuscle: "legs", secondaryMuscles: ["glutes"], equipment: "dumbbell", referenceLoadKg: 40, aliases: ["Goblet Squat", "Goblet Squats", "Genuflexiuni cu Gantere"] },
    { id: "bodyweight-squat", name: "Bodyweight Squat", primaryMuscle: "legs", secondaryMuscles: ["glutes"], equipment: "calisthenics", aliases: ["Squat", "Squats", "Genuflexiuni"] },
    { id: "leg-press", name: "Leg Press", primaryMuscle: "legs", secondaryMuscles: [], equipment: "machine", referenceLoadKg: 200 },
    { id: "leg-extension", name: "Leg Extension", primaryMuscle: "legs", secondaryMuscles: [], equipment: "machine", referenceLoadKg: 70 },
    { id: "prone-leg-curl", name: "Prone Leg Curl", primaryMuscle: "legs", secondaryMuscles: [], equipment: "machine", referenceLoadKg: 55 },
    genericMovement("legs", "barbell"),
    genericMovement("legs", "dumbbell"),
    genericMovement("legs", "cable"),
  ],
  calves: [
    { id: "calf-raise", name: "Standing Calf Raise", primaryMuscle: "calves", secondaryMuscles: [], equipment: "machine", aliases: ["Calf Raise", "Standing Calf Raise", "Standing Calf Raises"] },
    { id: "seated-calf-raise", name: "Seated Calf Raise", primaryMuscle: "calves", secondaryMuscles: [], equipment: "machine", aliases: ["Seated Calf Raises", "Sitting Calf Raise"] },
    genericMovement("calves", "dumbbell"),
    genericMovement("calves", "barbell"),
  ],
  core: [
    { id: "plank", name: "Plank", primaryMuscle: "core", secondaryMuscles: [], equipment: "calisthenics" },
    { id: "bench-crunches", name: "Bench Crunches", primaryMuscle: "core", secondaryMuscles: [], equipment: "calisthenics" },
    { id: "knee-raises", name: "Knee Raises", primaryMuscle: "core", secondaryMuscles: [], equipment: "calisthenics", aliases: ["Knee Raise", "Lying Knee Raises", "Captain's Chair Knee Raises"] },
    { id: "hanging-knee-raises", name: "Hanging Knee Raises", primaryMuscle: "core", secondaryMuscles: ["forearms"], equipment: "calisthenics", aliases: ["Hanging Knee Raise", "Hanging Leg Raises", "Hanging Leg Raise"] },
    { id: "lateral-abs-machine", name: "Lateral Abs Machine", primaryMuscle: "core", secondaryMuscles: [], equipment: "lateral-abs-machine" },
    genericMovement("core", "cable"),
    genericMovement("core", "dumbbell"),
  ],
  cardio: [
    { id: "treadmill", name: "Treadmill", primaryMuscle: "cardio", secondaryMuscles: [], equipment: "treadmill", aliases: ["Run", "Running", "Jog", "Jogging", "Walk", "Alergare", "Banda", "Banda de Alergat"] },
    { id: "boxing", name: "Boxing", primaryMuscle: "cardio", secondaryMuscles: ["shoulders", "core"], equipment: "calisthenics", aliases: ["Box", "Boxing Rounds", "Shadow Boxing", "Bag Work", "Heavy Bag", "Sparring", "Box Fitness"] },
  ],
};

/**
 * Movements to offer for a muscle group. Curated muscles get their named list;
 * the rest get the full generic-gear list — exactly the toggle shown today.
 */
export function movementsForMuscle(muscle: MuscleGroup): readonly Movement[] {
  return CURATED[muscle] ?? GENERIC_EQUIPMENT.map((eq) => genericMovement(muscle, eq));
}

const REGISTRY: ReadonlyMap<string, Movement> = new Map(
  MUSCLE_GROUPS.flatMap((m) => movementsForMuscle(m)).map((mv) => [mv.id, mv]),
);

/** Look up a movement by id, or undefined for an unknown/legacy id. */
export function findMovement(id: string): Movement | undefined {
  return REGISTRY.get(id);
}

/**
 * The working-load reference (kg) to normalise an exercise's volume by in the
 * effort gauge: the catalog movement's own {@link Movement.referenceLoadKg} when
 * it declares one, otherwise the primary muscle's
 * {@link MUSCLE_REFERENCE_LOAD_KG}. Lets a deadlift and a back extension that
 * both credit the lower back be weighed against their own typical loads rather
 * than a single per-muscle figure. Legacy logs (no/unknown `exerciseId`) keep the
 * per-muscle fallback unchanged.
 */
export function movementLoadReferenceKg(
  exerciseId: string | undefined,
  muscle: MuscleGroup,
): number {
  const mv = exerciseId !== undefined ? REGISTRY.get(exerciseId) : undefined;
  return mv?.referenceLoadKg ?? MUSCLE_REFERENCE_LOAD_KG[muscle];
}

/** Every catalog movement, deduped by id, in muscle-group then catalog order. */
export function allMovements(): readonly Movement[] {
  return [...REGISTRY.values()];
}

/** Lowercased, diacritic-stripped, whitespace-collapsed form for loose name matching. */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Curated lifts only (ids without "::"). Generic-gear movements are named just
// "Dumbbell"/"Cable"/… and repeat across muscles, so matching them by name would
// be ambiguous and let an equipment word masquerade as a movement. Aliases are
// indexed alongside the canonical name; first-write wins, so canonical names go
// in before aliases by iterating once for each pass.
const BY_NAME: ReadonlyMap<string, Movement> = (() => {
  const map = new Map<string, Movement>();
  for (const mv of REGISTRY.values()) {
    if (mv.id.includes("::")) continue;
    const key = normalizeName(mv.name);
    if (key !== "" && !map.has(key)) map.set(key, mv);
  }
  for (const mv of REGISTRY.values()) {
    if (mv.id.includes("::")) continue;
    for (const alias of mv.aliases ?? []) {
      const key = normalizeName(alias);
      if (key !== "" && !map.has(key)) map.set(key, mv);
    }
  }
  return map;
})();

/**
 * Best-effort match of a free-text exercise name (e.g. a routine row) to a
 * curated catalog movement — case- and diacritic-insensitive, exact on the
 * normalized name. Returns undefined when there's no confident match (the
 * common case for free-text Romanian rows), so the caller asks the user.
 */
export function matchMovementByName(name: string): Movement | undefined {
  const key = normalizeName(name);
  return key === "" ? undefined : BY_NAME.get(key);
}

/**
 * Every curated compound lift, in catalog order. A movement is "compound" when
 * it taxes secondary muscles; generic-gear movements have none, so this yields
 * only the named multi-muscle lifts (e.g. the bench/incline presses, deadlifts).
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
