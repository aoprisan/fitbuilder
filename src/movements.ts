import { registerTranslations, t } from "./i18n";
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
  /**
   * Isometric hold — measured by *time held* rather than reps (plank, dead hang).
   * The live logger drops the reps dial for these and logs the stopwatch hold as
   * the set's {@link WorkSet.durationSec}, leaving `reps` at 0. Absent → a normal
   * reps × load movement, so every other movement behaves exactly as before.
   */
  hold?: boolean;
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

/**
 * Curated, named movements per muscle group — trimmed to the lifts actually
 * trained (2026-11 catalog cleanup); add a movement here when you start doing it.
 *
 * A named movement that took over a generic-gear slot keeps the legacy
 * `"${muscle}::${equipment}"` id (e.g. "traps::barbell" is now "Barbell Shrug"),
 * so sets logged under the old "Traps · Barbell" pick stay in the same progress
 * series and are shown under the new name. Gear-only picks that were really a
 * named lift are folded into it by {@link LEGACY_KEYS} instead.
 */
const CURATED: Partial<Record<MuscleGroup, readonly Movement[]>> = {
  chest: [
    { id: "bench-press", name: "Bench Press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "barbell" },
    { id: "incline-bench-press", name: "Incline Bench Press", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "barbell" },
    { id: "larsen-press", name: "Larsen Press", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "barbell", aliases: ["Larson Press", "Legs-Up Bench Press"] },
    { id: "push-up", name: "Push-Up", primaryMuscle: "chest", secondaryMuscles: ["triceps", "front-delts"], equipment: "calisthenics", aliases: ["Push-Ups", "Push Ups", "Pushup", "Pushups", "Flotari", "Flotari pe Sol", "Flotari Sol"] },
    { id: "decline-push-up", name: "Decline Push-Up", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "calisthenics", aliases: ["Decline Push-Ups", "Decline Push Ups", "Feet-Elevated Push-Up", "Flotari Inclinate", "Flotari cu Picioarele Sus"] },
    { id: "diamond-push-up", name: "Diamond Push-Up", primaryMuscle: "triceps", secondaryMuscles: ["chest", "front-delts"], equipment: "calisthenics", aliases: ["Diamond Push-Ups", "Diamond Push Ups", "Flotari Diamant"] },
    { id: "incline-chest-press-machine", name: "Incline Chest Press Machine", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "machine" },
    { id: "medium-incline-chest-press-machine", name: "Vertical Bench Press Machine", primaryMuscle: "chest", secondaryMuscles: ["front-delts", "triceps"], equipment: "machine", aliases: ["Medium Incline Chest Press Machine"] },
    { id: "chest-fly-machine", name: "Chest Fly Machine", primaryMuscle: "chest", secondaryMuscles: [], equipment: "machine" },
  ],
  back: [
    { id: "pull-up", name: "Pull-Up", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "calisthenics", aliases: ["Pull-Ups", "Pull Ups", "Tractiuni", "Tractiuni Pronate"] },
    { id: "chin-up", name: "Chin-Up", primaryMuscle: "back", secondaryMuscles: ["biceps"], equipment: "calisthenics", aliases: ["Chin-Ups", "Chin Ups", "Tractiuni Supinate"] },
    { id: "pronated-grip-pulldown", name: "Pronated Grip Pulldown", primaryMuscle: "back", secondaryMuscles: ["biceps", "forearms"], equipment: "lat-pulldown", aliases: ["Pronated Pulldown", "Wide Grip Pulldown", "Lat Pulldown Pronated"] },
    { id: "neutral-grip-pulldown", name: "Neutral Grip Pulldown", primaryMuscle: "back", secondaryMuscles: ["biceps", "forearms"], equipment: "lat-pulldown", aliases: ["Neutral Pulldown", "Neutral Grip Lat Pulldown", "Close Grip Pulldown"] },
    { id: "cable-row", name: "Cable Row Machine", primaryMuscle: "back", secondaryMuscles: ["biceps", "traps", "rear-delts"], equipment: "cable", aliases: ["Cable Row", "Seated Cable Row", "Ramat la Cablu"] },
    { id: "seated-row", name: "Seated Row Machine", primaryMuscle: "back", secondaryMuscles: ["biceps", "traps", "rear-delts"], equipment: "machine", aliases: ["Seated Row", "Row Machine", "Machine Row"] },
  ],
  "lower-back": [
    { id: "back-extension", name: "Back Extension", primaryMuscle: "lower-back", secondaryMuscles: ["glutes"], isolation: true, equipment: "calisthenics", referenceLoadKg: 40, aliases: ["Hyperextension", "Hyperextensions", "Superman", "Hiper Extensii", "Hiper Extensii Superman"] },
    { id: "back-extension-machine", name: "Back Extension Machine", primaryMuscle: "lower-back", secondaryMuscles: ["glutes"], isolation: true, equipment: "machine", referenceLoadKg: 90 },
  ],
  // Deltoids split by head. Pressing is anterior-dominant, lateral raises isolate
  // the medial head, and the reverse fly works the posterior head. Compounds
  // spread credit across heads via secondaries.
  "front-delts": [
    { id: "overhead-press", name: "Overhead Press", primaryMuscle: "front-delts", secondaryMuscles: ["side-delts", "triceps"], equipment: "barbell", aliases: ["Shoulder Press", "Military Press", "Presa Umeri"] },
  ],
  "side-delts": [
    { id: "lateral-raise-machine", name: "Lateral Raise Machine", primaryMuscle: "side-delts", secondaryMuscles: [], equipment: "lateral-raise", aliases: ["Machine Lateral Raise", "Lateral Raises Machine"] },
    { id: "cable-lateral-raise", name: "Cable Lateral Raise (Behind Back)", primaryMuscle: "side-delts", secondaryMuscles: [], equipment: "cable", aliases: ["Behind-the-Back Cable Lateral Raise", "Behind Back Cable Lateral Raise", "Cable Side Raise"] },
  ],
  "rear-delts": [
    { id: "rear-delt-fly-machine", name: "Rear Delt Fly Machine", primaryMuscle: "rear-delts", secondaryMuscles: ["traps"], isolation: true, equipment: "rear-delt-fly", aliases: ["Reverse Pec Deck", "Reverse Fly Machine", "Rear Delt Machine"] },
  ],
  traps: [
    { id: "traps::barbell", name: "Barbell Shrug", primaryMuscle: "traps", secondaryMuscles: [], equipment: "barbell", aliases: ["Barbell Shrugs", "Shrug", "Shrugs"] },
    { id: "traps::dumbbell", name: "Dumbbell Shrug", primaryMuscle: "traps", secondaryMuscles: [], equipment: "dumbbell", aliases: ["Dumbbell Shrugs"] },
    { id: "traps::cable", name: "Cable Shrug", primaryMuscle: "traps", secondaryMuscles: [], equipment: "cable", aliases: ["Cable Shrugs"] },
  ],
  biceps: [
    { id: "biceps::barbell", name: "Barbell Curl", primaryMuscle: "biceps", secondaryMuscles: [], equipment: "barbell", aliases: ["Barbell Curls", "Standing Barbell Curl"] },
    { id: "wall-barbell-curl", name: "Wall Barbell Curl", primaryMuscle: "biceps", secondaryMuscles: [], equipment: "barbell", aliases: ["Barbell Wall Curl", "Wall Curl", "Strict Barbell Curl"] },
    { id: "biceps::dumbbell", name: "Dumbbell Curl", primaryMuscle: "biceps", secondaryMuscles: [], equipment: "dumbbell", aliases: ["Dumbbell Curls"] },
    { id: "biceps::cable", name: "Cable Curl", primaryMuscle: "biceps", secondaryMuscles: [], equipment: "cable", aliases: ["Cable Curls"] },
  ],
  triceps: [
    { id: "triceps::machine", name: "Triceps Press Machine", primaryMuscle: "triceps", secondaryMuscles: [], equipment: "machine", aliases: ["Triceps Machine", "Triceps Dip Machine", "Triceps Press"] },
    { id: "triceps::cable", name: "Triceps Pushdown", primaryMuscle: "triceps", secondaryMuscles: [], equipment: "cable", aliases: ["Cable Pushdown", "Triceps Pushdowns", "Rope Pushdown"] },
  ],
  legs: [
    { id: "deadlift", name: "Deadlift", primaryMuscle: "legs", secondaryMuscles: ["glutes", "lower-back"], equipment: "barbell", referenceLoadKg: 150 },
    { id: "romanian-deadlift", name: "Romanian Deadlift", primaryMuscle: "legs", secondaryMuscles: ["glutes", "lower-back"], equipment: "barbell", referenceLoadKg: 120 },
    { id: "dumbbell-squat", name: "Dumbbell Squat", primaryMuscle: "legs", secondaryMuscles: ["glutes"], equipment: "dumbbell", referenceLoadKg: 40, aliases: ["Goblet Squat", "Goblet Squats", "Genuflexiuni cu Gantere"] },
    { id: "bodyweight-squat", name: "Bodyweight Squat", primaryMuscle: "legs", secondaryMuscles: ["glutes"], equipment: "calisthenics", aliases: ["Squat", "Squats", "Genuflexiuni"] },
    // Partner-loaded squat: the training partner riding on your back *is* the
    // load, so it logs as bodyweight gear with their weight as the added kg —
    // hence a reference near a person rather than the leg baseline.
    { id: "partner-back-squat", name: "Partner Squat (Human on Back)", primaryMuscle: "legs", secondaryMuscles: ["glutes", "lower-back"], equipment: "calisthenics", referenceLoadKg: 70, aliases: ["Human on Back Squat", "Human Back Squat", "Piggyback Squat", "Partner Squat", "Partner Back Squat", "Genuflexiuni cu Partener", "Genuflexiuni cu Om in Spate"] },
    { id: "dumbbell-lunge", name: "Dumbbell Lunge", primaryMuscle: "legs", secondaryMuscles: ["glutes"], equipment: "dumbbell", referenceLoadKg: 24, aliases: ["Walking Lunges", "Dumbbell Lunges", "Fandari cu Gantere"] },
    { id: "leg-press", name: "Leg Press", primaryMuscle: "legs", secondaryMuscles: [], equipment: "machine", referenceLoadKg: 200 },
    { id: "leg-extension", name: "Leg Extension", primaryMuscle: "legs", secondaryMuscles: [], equipment: "machine", referenceLoadKg: 70 },
    { id: "prone-leg-curl", name: "Prone Leg Curl", primaryMuscle: "legs", secondaryMuscles: [], equipment: "machine", referenceLoadKg: 55 },
  ],
  // Nothing glute-primary is trained yet; the squats and deadlifts credit it as
  // a secondary. Empty (not absent) so it doesn't fall back to every gear type.
  glutes: [],
  calves: [
    { id: "calf-raise", name: "Standing Calf Raise", primaryMuscle: "calves", secondaryMuscles: [], equipment: "machine", aliases: ["Calf Raise", "Standing Calf Raise", "Standing Calf Raises"] },
    { id: "seated-calf-raise", name: "Seated Calf Raise", primaryMuscle: "calves", secondaryMuscles: [], equipment: "machine", aliases: ["Seated Calf Raises", "Sitting Calf Raise"] },
  ],
  core: [
    { id: "plank", name: "Plank", primaryMuscle: "core", secondaryMuscles: ["front-delts", "glutes"], hold: true, equipment: "calisthenics", aliases: ["Front Plank", "Forearm Plank", "Planca"] },
    { id: "bench-crunches", name: "Bench Crunches", primaryMuscle: "core", secondaryMuscles: [], equipment: "calisthenics" },
    { id: "knee-raises", name: "Knee Raises", primaryMuscle: "core", secondaryMuscles: [], equipment: "calisthenics", aliases: ["Knee Raise", "Lying Knee Raises", "Captain's Chair Knee Raises"] },
    { id: "hanging-knee-raises", name: "Hanging Knee Raises", primaryMuscle: "core", secondaryMuscles: ["forearms"], isolation: true, equipment: "calisthenics", aliases: ["Hanging Knee Raise", "Hanging Leg Raises", "Hanging Leg Raise"] },
    { id: "core::cable", name: "Cable Crunch", primaryMuscle: "core", secondaryMuscles: [], equipment: "cable", aliases: ["Cable Crunches", "Kneeling Cable Crunch"] },
    { id: "lateral-abs-machine", name: "Lateral Abs Machine", primaryMuscle: "core", secondaryMuscles: [], equipment: "lateral-abs-machine" },
  ],
  forearms: [
    { id: "forearms::dumbbell", name: "Dumbbell Wrist Curl", primaryMuscle: "forearms", secondaryMuscles: [], equipment: "dumbbell", aliases: ["Dumbbell Wrist Curls", "Wrist Curl", "Wrist Curls"] },
    { id: "forearms::barbell", name: "Barbell Wrist Curl", primaryMuscle: "forearms", secondaryMuscles: [], equipment: "barbell", aliases: ["Barbell Wrist Curls"] },
  ],
  cardio: [
    { id: "treadmill", name: "Treadmill", primaryMuscle: "cardio", secondaryMuscles: [], equipment: "treadmill", aliases: ["Run", "Running", "Jog", "Jogging", "Walk", "Alergare", "Banda", "Banda de Alergat"] },
    { id: "treadmill-intervals", name: "Treadmill Intervals", primaryMuscle: "cardio", secondaryMuscles: [], equipment: "treadmill", aliases: ["Interval Treadmill", "Treadmill HIIT", "HIIT Treadmill", "Interval Run", "Interval Running", "Treadmill Sprints", "Intervale Banda"] },
    { id: "boxing", name: "Boxing", primaryMuscle: "cardio", secondaryMuscles: ["front-delts", "core"], isolation: true, equipment: "calisthenics", aliases: ["Box", "Boxing Rounds", "Shadow Boxing", "Bag Work", "Heavy Bag", "Sparring", "Box Fitness"] },
  ],
};

/**
 * Legacy exercise keys folded into a current movement, so their sets join that
 * movement's progress series. Early logs used the machine's equipment as a
 * generic pick ("Side Delts · Lateral Raise" was the lateral raise machine, the
 * "Triceps Press" gear was the triceps machine).
 */
const LEGACY_KEYS: Readonly<Record<string, string>> = {
  "side-delts::lateral-raise": "lateral-raise-machine",
  "side-delts::rear-delt-fly": "rear-delt-fly-machine",
  "rear-delts::rear-delt-fly": "rear-delt-fly-machine",
  "triceps::triceps-press": "triceps::machine",
  // Gear-only picks that were a named lift.
  "chest::barbell": "bench-press",
  "front-delts::barbell": "overhead-press",
  "side-delts::barbell": "overhead-press",
  "side-delts::cable": "cable-lateral-raise",
  "glutes::calisthenics": "bodyweight-squat",
};

/** The current id for an exercise key/id, resolving {@link LEGACY_KEYS}. */
export function canonicalExerciseId(id: string): string {
  return LEGACY_KEYS[id] ?? id;
}

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

/** Look up a movement by id (legacy keys resolved), or undefined for an unknown id. */
export function findMovement(id: string): Movement | undefined {
  return REGISTRY.get(canonicalExerciseId(id));
}

/** A gear-only pick ("Cable", "Barbell", …) rather than a named lift. */
function isGenericMovement(mv: Movement): boolean {
  return mv.name === EQUIPMENT_LABELS[mv.equipment];
}

// Romanian display names for the curated catalog (generic gear is translated
// through the equipment labels in i18n.ts). Catalog names and stored logs stay
// English; only what's shown changes.
registerTranslations({
  "Incline Bench Press": "Împins la Bancă Înclinată",
  "Larsen Press": "Împins Larsen",
  "Push-Up": "Flotări",
  "Decline Push-Up": "Flotări cu Picioarele Sus",
  "Diamond Push-Up": "Flotări Diamant",
  "Incline Chest Press Machine": "Aparat Împins Piept Înclinat",
  "Vertical Bench Press Machine": "Aparat Împins Vertical",
  "Chest Fly Machine": "Aparat Fluturări Piept",
  "Pull-Up": "Tracțiuni Pronate",
  "Chin-Up": "Tracțiuni Supinate",
  "Pronated Grip Pulldown": "Helcometru Priză Pronată",
  "Neutral Grip Pulldown": "Helcometru Priză Neutră",
  "Cable Row Machine": "Ramat la Cablu",
  "Seated Row Machine": "Aparat Ramat Șezând",
  "Back Extension": "Hiperextensii",
  "Back Extension Machine": "Aparat Hiperextensii",
  "Overhead Press": "Împins Deasupra Capului",
  "Lateral Raise Machine": "Aparat Ridicări Laterale",
  "Cable Lateral Raise (Behind Back)": "Ridicări Laterale la Cablu (Pe la Spate)",
  "Rear Delt Fly Machine": "Aparat Fluturări Umăr Posterior",
  "Wall Barbell Curl": "Flexii cu Bara la Perete",
  Deadlift: "Îndreptări",
  "Romanian Deadlift": "Îndreptări Românești",
  "Dumbbell Squat": "Genuflexiuni cu Gantere",
  "Bodyweight Squat": "Genuflexiuni",
  "Partner Squat (Human on Back)": "Genuflexiuni cu Partener (Om în Spate)",
  "Dumbbell Lunge": "Fandări cu Gantere",
  "Leg Press": "Presă Picioare",
  "Leg Extension": "Extensii Picioare",
  "Prone Leg Curl": "Flexii Picioare din Culcat",
  "Standing Calf Raise": "Ridicări pe Vârfuri din Picioare",
  "Seated Calf Raise": "Ridicări pe Vârfuri Șezând",
  Plank: "Planșă",
  "Bench Crunches": "Abdomene pe Bancă",
  "Knee Raises": "Ridicări de Genunchi",
  "Hanging Knee Raises": "Ridicări de Genunchi din Atârnat",
  "Barbell Shrug": "Ridicări din Umeri cu Bara",
  "Dumbbell Shrug": "Ridicări din Umeri cu Gantere",
  "Cable Shrug": "Ridicări din Umeri la Cablu",
  "Barbell Curl": "Flexii cu Bara",
  "Dumbbell Curl": "Flexii cu Gantere",
  "Cable Curl": "Flexii la Cablu",
  "Triceps Press Machine": "Aparat Presă Triceps",
  "Triceps Pushdown": "Extensii Triceps la Cablu",
  "Cable Crunch": "Abdomene la Cablu",
  "Dumbbell Wrist Curl": "Flexii din Încheietură cu Gantere",
  "Barbell Wrist Curl": "Flexii din Încheietură cu Bara",
  Treadmill: "Bandă de Alergare",
  "Treadmill Intervals": "Intervale pe Bandă",
  Boxing: "Box",
});

/**
 * Name to show for a logged exercise: a catalog movement logged under its
 * catalog name is shown in the app language; anything renamed or free-text
 * keeps the name it was logged with.
 */
export function displayExerciseName(ex: ExerciseNameSource): string {
  const name = catalogExerciseName(ex);
  return findLogged(ex)?.name === name ? t(name) : name;
}

/** What a logged exercise carries that names it. */
interface ExerciseNameSource {
  name: string;
  exerciseId?: string;
  muscle?: MuscleGroup;
  equipment?: Equipment;
}

/** The catalog movement a logged exercise points at (legacy keys resolved). */
function findLogged(ex: ExerciseNameSource): Movement | undefined {
  if (ex.exerciseId !== undefined && ex.exerciseId !== "") return findMovement(ex.exerciseId);
  if (ex.muscle !== undefined && ex.equipment !== undefined) return findMovement(`${ex.muscle}::${ex.equipment}`);
  return undefined;
}

/**
 * English name for a logged exercise: the catalog name when it was logged
 * under that name *or* under the old generic gear label (so a "Barbell" set on
 * traps reads "Barbell Shrug"); a renamed / free-text exercise keeps its own.
 */
export function catalogExerciseName(ex: ExerciseNameSource): string {
  const mv = findLogged(ex);
  if (mv === undefined) return ex.name;
  const legacyLabel = ex.equipment !== undefined ? EQUIPMENT_LABELS[ex.equipment] : EQUIPMENT_LABELS[mv.equipment];
  return ex.name === mv.name || ex.name === legacyLabel ? mv.name : ex.name;
}

/**
 * Whether an exercise is an isometric hold (plank, dead hang) — logged by time
 * held, not reps. Looks the movement up by its catalog id; an unknown/legacy id
 * (or undefined) is treated as a normal reps × load movement.
 */
export function isIsometricHold(exerciseId: string | undefined): boolean {
  return exerciseId !== undefined && findMovement(exerciseId)?.hold === true;
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
  const mv = exerciseId !== undefined ? findMovement(exerciseId) : undefined;
  return mv?.referenceLoadKg ?? MUSCLE_REFERENCE_LOAD_KG[muscle];
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

// Named lifts only. Generic-gear movements are named just
// "Dumbbell"/"Cable"/… and repeat across muscles, so matching them by name would
// be ambiguous and let an equipment word masquerade as a movement. Aliases are
// indexed alongside the canonical name; first-write wins, so canonical names go
// in before aliases by iterating once for each pass.
const BY_NAME: ReadonlyMap<string, Movement> = (() => {
  const map = new Map<string, Movement>();
  for (const mv of REGISTRY.values()) {
    if (isGenericMovement(mv)) continue;
    const key = normalizeName(mv.name);
    if (key !== "" && !map.has(key)) map.set(key, mv);
  }
  for (const mv of REGISTRY.values()) {
    if (isGenericMovement(mv)) continue;
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
