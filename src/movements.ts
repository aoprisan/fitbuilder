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
 * muscles a compound lift also taxes (bench press → chest + triceps + front delts).
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
  /**
   * Force-classify as an isolation movement even though it carries a secondary
   * muscle. The secondary is a minor *credit* bias (rear-delt fly → traps, back
   * extension → glutes), not a second worked region — so the movement stays out
   * of the compound picker ({@link isCompoundMovement}) and is offered under its
   * muscle in the Custom picker instead. Credit/analytics still use the secondary.
   */
  isolation?: boolean;
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
    { id: "bench-press", name: "Bench Press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "barbell" },
    { id: "incline-bench-press", name: "Incline Bench Press", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "barbell" },
    { id: "larsen-press", name: "Larsen Press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "barbell", aliases: ["Larson Press", "Legs-Up Bench Press"] },
    { id: "dips", name: "Dips", primaryMuscle: "chest", secondaryMuscles: ["triceps"], equipment: "calisthenics", aliases: ["Triceps Dips", "Straight Bar Dips"] },
    { id: "push-up", name: "Push-Up", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "calisthenics", aliases: ["Push-Ups", "Push Ups", "Pushup", "Pushups", "Flotari", "Flotari pe Sol", "Flotari Sol"] },
    { id: "decline-push-up", name: "Decline Push-Up", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "calisthenics", aliases: ["Decline Push-Ups", "Decline Push Ups", "Feet-Elevated Push-Up", "Flotari Inclinate", "Flotari cu Picioarele Sus"] },
    { id: "diamond-push-up", name: "Diamond Push-Up", primaryMuscle: "triceps", secondaryMuscles: ["chest", "front-delts"], equipment: "calisthenics", aliases: ["Diamond Push-Ups", "Diamond Push Ups", "Flotari Diamant"] },
    { id: "chest-press-machine", name: "Chest Press Machine", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "machine" },
    { id: "incline-chest-press-machine", name: "Incline Chest Press Machine", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "machine" },
    { id: "medium-incline-chest-press-machine", name: "Vertical Bench Press Machine", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "machine" },
    { id: "smith-machine-vertical-press", name: "Vertical Press (Smith Machine)", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "machine", aliases: ["Smith Machine Vertical Press", "Smith Vertical Press", "Vertical Press Smith Machine", "Smith Machine Chest Press"] },
    { id: "chest-fly-machine", name: "Chest Fly Machine", primaryMuscle: "chest", secondaryMuscles: [], equipment: "machine" },
    genericMovement("chest", "dumbbell"),
    genericMovement("chest", "barbell"),
    genericMovement("chest", "cable"),
  ],
  back: [
    { id: "pull-up", name: "Pull-Up", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "calisthenics", aliases: ["Pull-Ups", "Pull Ups", "Tractiuni", "Tractiuni Pronate"] },
    { id: "chin-up", name: "Chin-Up", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "calisthenics", aliases: ["Chin-Ups", "Chin Ups", "Tractiuni Supinate"] },
    { id: "inverted-row", name: "Inverted Row", primaryMuscle: "back", secondaryMuscles: ["biceps", "rear-delts"], equipment: "calisthenics", aliases: ["Australian Pull-Up", "Australian Pull-Ups", "Australiene", "Ramat", "Ramat Banda Elastica"] },
    { id: "muscle-up", name: "Muscle-Up", primaryMuscle: "back", secondaryMuscles: ["chest", "triceps"], equipment: "calisthenics", aliases: ["Muscle-Ups", "Muscle Up", "Muscle Ups"] },
    { id: "dead-hang", name: "Dead Hang", primaryMuscle: "forearms", secondaryMuscles: ["back"], isolation: true, equipment: "calisthenics", aliases: ["Dead Hangs"] },
    { id: "pronated-grip-pulldown", name: "Pronated Grip Pulldown", primaryMuscle: "back", secondaryMuscles: ["biceps", "forearms"], equipment: "lat-pulldown", aliases: ["Pronated Pulldown", "Wide Grip Pulldown", "Lat Pulldown Pronated"] },
    { id: "neutral-grip-pulldown", name: "Neutral Grip Pulldown", primaryMuscle: "back", secondaryMuscles: ["biceps", "forearms"], equipment: "lat-pulldown", aliases: ["Neutral Pulldown", "Neutral Grip Lat Pulldown", "Close Grip Pulldown"] },
    { id: "cable-row", name: "Cable Row Machine", primaryMuscle: "back", secondaryMuscles: ["biceps", "traps", "rear-delts"], equipment: "cable", aliases: ["Cable Row", "Seated Cable Row", "Ramat la Cablu"] },
    { id: "seated-row", name: "Seated Row Machine", primaryMuscle: "back", secondaryMuscles: ["biceps", "traps", "rear-delts"], equipment: "machine", aliases: ["Seated Row", "Row Machine", "Machine Row"] },
    { id: "straight-arm-pulldown", name: "Straight-Arm Pulldown", primaryMuscle: "back", secondaryMuscles: ["triceps"], isolation: true, equipment: "cable", aliases: ["Straight Arm Pulldown", "Straight-Arm Pull-Down", "Cable Straight-Arm Pulldown", "Lat Pushdown"] },
    { id: "lat-pullover", name: "Lat Pullover", primaryMuscle: "back", secondaryMuscles: ["chest"], isolation: true, equipment: "dumbbell", aliases: ["Pullover", "Dumbbell Pullover", "Cable Pullover"] },
    genericMovement("back", "barbell"),
    genericMovement("back", "dumbbell"),
    genericMovement("back", "cable"),
    genericMovement("back", "machine"),
    genericMovement("back", "lat-pulldown"),
  ],
  "lower-back": [
    { id: "back-extension", name: "Back Extension", primaryMuscle: "lower-back", secondaryMuscles: ["glutes"], isolation: true, equipment: "calisthenics", referenceLoadKg: 40, aliases: ["Hyperextension", "Hyperextensions", "Superman", "Hiper Extensii", "Hiper Extensii Superman"] },
    { id: "good-morning", name: "Good Morning", primaryMuscle: "lower-back", secondaryMuscles: ["glutes", "legs"], equipment: "barbell", referenceLoadKg: 80, aliases: ["Good Mornings"] },
    { id: "back-extension-machine", name: "Back Extension Machine", primaryMuscle: "lower-back", secondaryMuscles: ["glutes"], isolation: true, equipment: "machine", referenceLoadKg: 90 },
    genericMovement("lower-back", "barbell"),
    genericMovement("lower-back", "machine"),
  ],
  // Deltoids split by head. Pressing (overhead / pike / handstand) is anterior-
  // dominant, lateral raises isolate the medial head, and reverse-fly / face-pull
  // work the posterior head. Compounds spread credit across heads via secondaries.
  "front-delts": [
    { id: "overhead-press", name: "Overhead Press", primaryMuscle: "front-delts", secondaryMuscles: ["side-delts", "triceps"], equipment: "barbell", aliases: ["Shoulder Press", "Military Press", "Presa Umeri"] },
    { id: "seated-dumbbell-press", name: "Seated Dumbbell Press", primaryMuscle: "front-delts", secondaryMuscles: ["side-delts", "triceps"], equipment: "dumbbell", aliases: ["Dumbbell Shoulder Press", "Dumbbell Overhead Press", "Seated Shoulder Press"] },
    { id: "arnold-press", name: "Arnold Press", primaryMuscle: "front-delts", secondaryMuscles: ["side-delts", "triceps"], equipment: "dumbbell", aliases: ["Arnold Dumbbell Press"] },
    { id: "shoulder-press-machine", name: "Shoulder Press Machine", primaryMuscle: "front-delts", secondaryMuscles: ["side-delts", "triceps"], equipment: "machine", aliases: ["Machine Shoulder Press", "Machine Overhead Press"] },
    { id: "front-raise", name: "Front Raise", primaryMuscle: "front-delts", secondaryMuscles: [], equipment: "dumbbell", aliases: ["Dumbbell Front Raise", "Ridicari Frontale"] },
    { id: "pike-push-up", name: "Pike Push-Up", primaryMuscle: "front-delts", secondaryMuscles: ["triceps"], equipment: "calisthenics", aliases: ["Pike Push-Ups", "Pike Push Ups"] },
    { id: "handstand-push-up", name: "Handstand Push-Up", primaryMuscle: "front-delts", secondaryMuscles: ["side-delts", "triceps"], equipment: "calisthenics", aliases: ["Handstand Push-Ups", "Handstand Push Ups"] },
    genericMovement("front-delts", "dumbbell"),
    genericMovement("front-delts", "barbell"),
    genericMovement("front-delts", "cable"),
    genericMovement("front-delts", "machine"),
  ],
  "side-delts": [
    { id: "dumbbell-lateral-raise", name: "Dumbbell Lateral Raise", primaryMuscle: "side-delts", secondaryMuscles: [], equipment: "dumbbell", aliases: ["Lateral Raise", "Lateral Raises", "Side Raise", "Dumbbell Side Raise", "Ridicari Laterale"] },
    { id: "lateral-raise-machine", name: "Lateral Raise Machine", primaryMuscle: "side-delts", secondaryMuscles: [], equipment: "lateral-raise", aliases: ["Machine Lateral Raise", "Lateral Raises Machine"] },
    { id: "cable-lateral-raise", name: "Cable Lateral Raise (Behind Back)", primaryMuscle: "side-delts", secondaryMuscles: [], equipment: "cable", aliases: ["Behind-the-Back Cable Lateral Raise", "Behind Back Cable Lateral Raise", "Cable Side Raise"] },
    { id: "upright-row", name: "Upright Row", primaryMuscle: "side-delts", secondaryMuscles: ["traps", "front-delts"], equipment: "barbell", aliases: ["Barbell Upright Row", "Cable Upright Row"] },
    genericMovement("side-delts", "dumbbell"),
    genericMovement("side-delts", "cable"),
    genericMovement("side-delts", "lateral-raise"),
  ],
  "rear-delts": [
    { id: "rear-delt-fly-machine", name: "Rear Delt Fly Machine", primaryMuscle: "rear-delts", secondaryMuscles: ["traps"], isolation: true, equipment: "rear-delt-fly", aliases: ["Reverse Pec Deck", "Reverse Fly Machine", "Rear Delt Machine"] },
    { id: "dumbbell-rear-delt-fly", name: "Bent-Over Reverse Fly", primaryMuscle: "rear-delts", secondaryMuscles: ["traps"], isolation: true, equipment: "dumbbell", aliases: ["Reverse Fly", "Rear Delt Fly", "Bent-Over Reverse Fly", "Bent Over Lateral Raise", "Reverse Dumbbell Fly"] },
    { id: "face-pull", name: "Face Pull", primaryMuscle: "rear-delts", secondaryMuscles: ["traps"], isolation: true, equipment: "cable", aliases: ["Cable Face Pull", "Rope Face Pull"] },
    genericMovement("rear-delts", "dumbbell"),
    genericMovement("rear-delts", "cable"),
    genericMovement("rear-delts", "rear-delt-fly"),
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
    { id: "barbell-lunge", name: "Barbell Lunge", primaryMuscle: "legs", secondaryMuscles: ["glutes"], equipment: "barbell", referenceLoadKg: 60, aliases: ["Lunge", "Lunges", "Walking Lunge", "Fandari cu Bara"] },
    { id: "dumbbell-lunge", name: "Dumbbell Lunge", primaryMuscle: "legs", secondaryMuscles: ["glutes"], equipment: "dumbbell", referenceLoadKg: 24, aliases: ["Walking Lunges", "Dumbbell Lunges", "Fandari cu Gantere"] },
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
    { id: "plank", name: "Plank", primaryMuscle: "core", secondaryMuscles: ["front-delts", "glutes"], equipment: "calisthenics", aliases: ["Front Plank", "Forearm Plank", "Planca"] },
    { id: "bench-crunches", name: "Bench Crunches", primaryMuscle: "core", secondaryMuscles: [], equipment: "calisthenics" },
    { id: "knee-raises", name: "Knee Raises", primaryMuscle: "core", secondaryMuscles: [], equipment: "calisthenics", aliases: ["Knee Raise", "Lying Knee Raises", "Captain's Chair Knee Raises"] },
    { id: "hanging-knee-raises", name: "Hanging Knee Raises", primaryMuscle: "core", secondaryMuscles: ["forearms"], isolation: true, equipment: "calisthenics", aliases: ["Hanging Knee Raise", "Hanging Leg Raises", "Hanging Leg Raise"] },
    { id: "lateral-abs-machine", name: "Lateral Abs Machine", primaryMuscle: "core", secondaryMuscles: [], equipment: "lateral-abs-machine" },
    genericMovement("core", "cable"),
    genericMovement("core", "dumbbell"),
  ],
  cardio: [
    { id: "treadmill", name: "Treadmill", primaryMuscle: "cardio", secondaryMuscles: [], equipment: "treadmill", aliases: ["Run", "Running", "Jog", "Jogging", "Walk", "Alergare", "Banda", "Banda de Alergat"] },
    { id: "treadmill-intervals", name: "Treadmill Intervals", primaryMuscle: "cardio", secondaryMuscles: [], equipment: "treadmill", aliases: ["Interval Treadmill", "Treadmill HIIT", "HIIT Treadmill", "Interval Run", "Interval Running", "Treadmill Sprints", "Intervale Banda"] },
    { id: "boxing", name: "Boxing", primaryMuscle: "cardio", secondaryMuscles: ["front-delts", "core"], isolation: true, equipment: "calisthenics", aliases: ["Box", "Boxing Rounds", "Shadow Boxing", "Bag Work", "Heavy Bag", "Sparring", "Box Fitness"] },
  ],
};

/**
 * Movements to offer for a muscle group. Curated muscles get their named list;
 * the rest get the full generic-gear list — exactly the toggle shown today.
 */
export function movementsForMuscle(muscle: MuscleGroup): readonly Movement[] {
  return CURATED[muscle] ?? GENERIC_EQUIPMENT.map((eq) => genericMovement(muscle, eq));
}

/**
 * Whether a movement belongs in the compound picker: it taxes a secondary muscle
 * *and* isn't a movement explicitly flagged {@link Movement.isolation} (a single-
 * joint lift that lists a minor secondary only for credit, e.g. rear-delt fly →
 * traps). The single source of truth for the compound/isolation split — every UI
 * "is this a compound" check routes through here, not `secondaryMuscles.length`.
 */
export function isCompoundMovement(mv: Movement): boolean {
  return mv.secondaryMuscles.length > 0 && mv.isolation !== true;
}

/**
 * The *isolation* movements for a muscle — {@link movementsForMuscle} minus the
 * compound lifts. The muscle+gear ("custom") picker uses this so multi-muscle
 * lifts don't clutter muscle selection; compounds are reached only through the
 * dedicated compound picker ({@link compoundMovements}). Generic-gear movements
 * and flagged isolations (rear-delt fly, back extension, …) stay here.
 */
export function isolationMovementsForMuscle(muscle: MuscleGroup): readonly Movement[] {
  return movementsForMuscle(muscle).filter((mv) => !isCompoundMovement(mv));
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
 * Every curated compound lift, in catalog order — the movements for which
 * {@link isCompoundMovement} holds (taxes a secondary region and isn't a flagged
 * isolation). Yields only the named multi-muscle lifts (bench/incline presses,
 * deadlifts, squats, …); generic gear and single-joint isolations are excluded.
 */
export function compoundMovements(): readonly Movement[] {
  return MUSCLE_GROUPS.flatMap((m) => movementsForMuscle(m)).filter(isCompoundMovement);
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
