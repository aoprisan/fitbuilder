export type Equipment =
  | "cable"
  | "dumbbell"
  | "barbell"
  | "kettlebell"
  | "trx"
  | "calisthenics"
  | "machine"
  | "triceps-press"
  | "bench-press"
  | "lat-pulldown"
  | "rear-delt-fly"
  | "lateral-raise"
  | "lateral-abs-machine"
  | "treadmill";

export interface WorkSet {
  reps: number;
  /** External load in kg. For bodyweight equipment this is *added* weight (0 = bodyweight only). */
  weightKg: number;
  /** Seconds the set took, recorded by the live stopwatch. */
  durationSec?: number;
  /**
   * Reps in reserve at the end of the set — proximity to failure (0 = trained to
   * failure, higher = more reps left in the tank). Optional: when absent the set
   * is treated as a typical hard working set and the intensity heuristics behave
   * exactly as before. The strongest per-set driver of both stimulus and fatigue.
   */
  rir?: number;
  /**
   * Cardio (treadmill / run) — distance covered in km. Present only for cardio
   * gear, where a "set" is a bout of steady work rather than reps × load: `reps`
   * and `weightKg` stay 0 and the work is described by distance, speed and
   * incline instead. Absent on every strength set, so the strength heuristics are
   * untouched.
   */
  distanceKm?: number;
  /** Cardio — average speed in km/h. */
  speedKmh?: number;
  /** Cardio — treadmill incline as a percent grade (0 = flat). */
  inclinePct?: number;
}

export const EQUIPMENT: readonly Equipment[] = [
  "cable",
  "dumbbell",
  "barbell",
  "kettlebell",
  "trx",
  "calisthenics",
  "machine",
  "triceps-press",
  "bench-press",
  "lat-pulldown",
  "rear-delt-fly",
  "lateral-raise",
  "lateral-abs-machine",
  "treadmill",
] as const;

/** Human-readable label for each equipment type. */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  cable: "Cable",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  kettlebell: "Kettlebell",
  trx: "TRX",
  calisthenics: "Calisthenics",
  machine: "Machine",
  "triceps-press": "Triceps Press",
  "bench-press": "Bench Press",
  "lat-pulldown": "Lat Pulldown",
  "rear-delt-fly": "Rear Delt Fly",
  "lateral-raise": "Lateral Raise",
  "lateral-abs-machine": "Lateral Abs Machine",
  treadmill: "Treadmill",
};

/** Equipment whose sets are bodyweight-based; any weight is *added* load. */
export const BODYWEIGHT_EQUIPMENT: readonly Equipment[] = ["trx", "calisthenics"] as const;

export function isBodyweight(equipment: Equipment): boolean {
  return (BODYWEIGHT_EQUIPMENT as readonly Equipment[]).includes(equipment);
}

/**
 * Cardio equipment: a "set" is a timed bout described by distance / speed /
 * incline rather than reps × load. These sets carry 0 reps and 0 weight, so the
 * strength heuristics (volume, 1RM, hypertrophy) read them as no-ops; the cardio
 * fields on {@link WorkSet} drive the energy and progress read instead.
 */
export const CARDIO_EQUIPMENT: readonly Equipment[] = ["treadmill"] as const;

export function isCardio(equipment: Equipment): boolean {
  return (CARDIO_EQUIPMENT as readonly Equipment[]).includes(equipment);
}

/* =============================================================================
   Routine sheets — shareable training documents.
   A sheet stacks several routines (like the printed gym wall-charts). Every
   exercise carries a *structured* target: either an explicit per-set scheme
   (3×[10@20], ramps, pyramids) or a self-paced total-rep volume ("50 reps, broken
   up however you like"). Sheets are built to be exported as PNG/PDF and shared.
   ========================================================================== */

/**
 * One prescribed working set in a per-set scheme — reps and (optionally) a
 * target load. A list of these expresses uniform schemes (3×[10@20]) as well as
 * ramps/pyramids ([12@60, 10@70, 8@80]). `loadKg` absent = bodyweight / no
 * prescribed load (calisthenics).
 */
export interface SetTarget {
  reps: number;
  loadKg?: number;
}

/**
 * A fixed per-set scheme: the trainer prescribes each set explicitly. Drives the
 * Execute runner set-by-set against `sets[k]` (reps + optional load).
 */
export interface PerSetTarget {
  kind: "sets";
  sets: SetTarget[];
}

/**
 * A self-paced total-rep goal: the trainee fulfils `totalReps` across as many
 * sets as they like (e.g. "pull-ups, 50 reps" done 15/15/…). `loadKg` absent =
 * bodyweight. Execute counts reps toward the total rather than counting sets.
 */
export interface VolumeTarget {
  kind: "volume";
  totalReps: number;
  loadKg?: number;
}

/**
 * The two ways a trainer defines an exercise's work: a fixed per-set scheme
 * (`kind: "sets"`) or a self-paced rep volume (`kind: "volume"`). The `kind`
 * discriminator is what the builder's mode switch toggles.
 */
export type ExerciseTarget = PerSetTarget | VolumeTarget;

export interface RoutineExercise {
  name: string;
  /**
   * The structured work for this exercise — a per-set scheme or a rep volume.
   * Absent only for note-only rows (timed holds, round-based work, or an import
   * whose text couldn't be parsed into reps); Execute completes those with a
   * manual done toggle.
   */
  target?: ExerciseTarget;
  /**
   * Optional short human note — a coaching cue, or the original text carried over
   * when an imported wall-chart row couldn't be parsed into a structured target.
   * Never drives the runner; it's display-only.
   */
  note?: string;
  /**
   * Catalog identity carried from `movements.ts`, mirroring `LoggedExercise`.
   * Populated when the builder/importer name matches a curated movement, or when
   * a Claude-authored routine tags the row directly (`muscle` + `equipment`, often
   * without an `exerciseId`); absent on unmatched, untagged rows. Consumers
   * (Execute, `sheetToSession`) prefer the carried muscle + load type when present
   * — the `exerciseId` is optional — falling back to a runtime name-match.
   */
  exerciseId?: string;
  muscle?: MuscleGroup;
  equipment?: Equipment;
  secondaryMuscles?: readonly MuscleGroup[];
}

/**
 * Whether a {@link Routine} is a loose movement list (`"movements"`, what an
 * imported wall-chart produces) or a structured, section-organised training
 * session (`"session"`). The discriminator the builder's type switch toggles.
 */
export type RoutineKind = "movements" | "session";

/**
 * One named block of a structured session — e.g. "Warm-up", "Main", "Accessory" —
 * holding its own ordered exercises. A `title` of "" renders as an unlabelled
 * block (and is what a movement list collapses to when read section-wise).
 */
export interface RoutineSection {
  title: string;
  exercises: RoutineExercise[];
}

export interface Routine {
  /**
   * What kind of training document this routine is:
   *  - `"movements"` — a loose movement list with free-text/volume prescriptions,
   *    what an imported wall-chart (Excel/PDF) produces. The flat {@link exercises}
   *    array is the source of truth.
   *  - `"session"` — a structured session organised into named {@link sections}
   *    (e.g. Warm-up → Main → Accessory), each exercise carrying an explicit
   *    sets×reps×load scheme. {@link sections} is the source of truth.
   * Absent on older routines and treated as `"movements"`, so legacy sheets and
   * imports are unchanged.
   */
  kind?: RoutineKind;
  /** e.g. "RUTINA IMPINS". */
  title: string;
  /** Free-text labels rendered as chips, e.g. ["INTERMEDIAR+", "PARC", "60-100 antrenamente"]. */
  tags: string[];
  /** The flat exercise list — the source of truth for a `"movements"` routine. */
  exercises: RoutineExercise[];
  /**
   * Named sections — the source of truth for a `"session"` routine. Each section
   * groups its own ordered exercises under a label (Warm-up, Main, …). Absent for
   * a movement-list routine. Read uniformly via `routineExercises` /
   * `routineSections` so run / export / render code stays section-agnostic.
   */
  sections?: RoutineSection[];
}

export interface RoutineSheet {
  schema: "gymlog.routine-sheet";
  version: 1;
  /** uuid; regenerated on import if missing or blank. */
  id: string;
  /** Document title, e.g. "Rutina Impins — Calisthenics". */
  name: string;
  routines: Routine[];
  /** ISO timestamp of last save. */
  updatedAt?: string;
}

export const SHEET_SCHEMA_ID = "gymlog.routine-sheet" as const;
export const SHEET_SCHEMA_VERSION = 1 as const;

/* =============================================================================
   Training sessions — live workout logs.
   Unlike an ExercisePlan (a template designed ahead of time), a TrainingSession
   is a journal of an actual workout: started at a moment in time and filled in
   set-by-set at the gym. Each logged exercise tags the muscle group worked.
   ========================================================================== */

export type MuscleGroup =
  | "chest"
  | "back"
  | "lower-back"
  | "shoulders"
  | "traps"
  | "biceps"
  | "triceps"
  | "legs"
  | "glutes"
  | "core"
  | "forearms"
  | "calves"
  | "cardio";

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  "chest",
  "back",
  "lower-back",
  "shoulders",
  "traps",
  "biceps",
  "triceps",
  "legs",
  "glutes",
  "core",
  "forearms",
  "calves",
  "cardio",
] as const;

/**
 * Human-readable label for each muscle group. `cardio` is not a muscle but a
 * training category (treadmill / conditioning); it rides the same per-group
 * machinery — its own catalog list, recovery clock and effort line — so it slots
 * into the live picker, recovery board and breakdowns alongside the real muscles.
 */
export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  "lower-back": "Lower Back",
  shoulders: "Shoulders",
  traps: "Traps",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  glutes: "Glutes",
  core: "Core",
  forearms: "Forearms",
  calves: "Calves",
  cardio: "Cardio",
};

export interface LoggedExercise {
  name: string;
  /** Primary muscle group worked. */
  muscle: MuscleGroup;
  /** Load type — how the set is loaded (drives the kg dial and load formatting). */
  equipment: Equipment;
  /**
   * Stable movement identity from the exercise catalog (e.g. "incline-bench-press").
   * Absent on legacy logs, which fall back to a "muscle::equipment" key.
   */
  exerciseId?: string;
  /** Muscles also worked by a compound movement, copied from the catalog at log time. */
  secondaryMuscles?: readonly MuscleGroup[];
  /** Free-text target carried from a routine (e.g. "30-50 repetari"); absent for ad-hoc exercises. */
  prescription?: string;
  /**
   * The trainer's *structured* guideline for this exercise, carried verbatim from
   * the source routine when a session is started from one (`sheetToSession` /
   * Execute runs). Drives the live per-set benchmark (prescribed reps/load vs what
   * you log) and the session adherence read. Absent for freestyle/off-plan
   * exercises and for older logs — in which case the benchmark falls back to the
   * free-text {@link prescription}, leaving legacy logs unchanged.
   */
  target?: ExerciseTarget;
  /**
   * The session phase this exercise belongs to (e.g. "Warm-up", "Main"), carried
   * from a structured-session routine's {@link RoutineSection} when a Live "Follow"
   * session is started from it. Display-only — groups the live flow by phase.
   * Absent for freestyle / movement-list / off-plan exercises.
   */
  section?: string;
  /** User-logged one-rep max in kg; the calculated estimate is derived from the sets. */
  oneRmKg?: number;
  sets: WorkSet[];
}

export interface TrainingSession {
  schema: "gymlog.training-session";
  version: 1;
  /** uuid; regenerated on load if missing or blank. */
  id: string;
  /** Free-text label, e.g. "Push day". Defaults to the start date. */
  name: string;
  /** ISO timestamp of when the session was started. */
  startedAt: string;
  exercises: LoggedExercise[];
  /**
   * How the session was logged: "live" (the Live tab, set-by-set with timers) or
   * "routine" (saved from an Execute run of a routine sheet). Absent on older
   * logs and treated as "live"; lets effort calibration tell the two apart if
   * routine runs (often reps-only) start skewing the median.
   */
  source?: "live" | "routine";
  /**
   * Id of the RoutineSheet this session was started from (set by `sheetToSession`
   * and Execute runs). Absent for freestyle Live sessions. Enables adherence and
   * compare-to-plan analytics — filter sessions by their source routine.
   */
  fromSheetId?: string;
  /** ISO timestamp of last save. */
  updatedAt?: string;
}

export const LOG_SCHEMA_ID = "gymlog.training-session" as const;
export const LOG_SCHEMA_VERSION = 1 as const;

/* =============================================================================
   Session archive — a self-describing bundle of every logged session, built
   for export so the data can be imported into other tools and analysed there.
   ========================================================================== */

export interface SessionArchive {
  schema: "gymlog.session-archive";
  version: 1;
  /** ISO timestamp of when the archive was exported. */
  exportedAt: string;
  /** Number of sessions in the archive. */
  count: number;
  sessions: TrainingSession[];
}

export const SESSION_ARCHIVE_SCHEMA_ID = "gymlog.session-archive" as const;
export const SESSION_ARCHIVE_SCHEMA_VERSION = 1 as const;
