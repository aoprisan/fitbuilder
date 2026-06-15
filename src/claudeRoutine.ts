import { findMovement, isCompoundMovement } from "./movements";
import { exerciseHistoryLines } from "./progression";
import {
  bestOneRm,
  exerciseKey,
  exerciseKeyLabel,
  type ExerciseKey,
  presentExerciseKeys,
  sessionCountsByExercise,
} from "./stats";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  type MuscleGroup,
  SHEET_SCHEMA_ID,
  SHEET_SCHEMA_VERSION,
  type TrainingSession,
} from "./types";
import { round2 } from "./util";

// The exact enum vocabularies Claude must choose from when tagging an exercise's
// muscle / load type, surfaced verbatim in the prompt so the values round-trip
// through `asMuscle`/`asEquipment` (anything off-list is dropped on import).
const MUSCLE_VALUES = MUSCLE_GROUPS.join(", ");
const EQUIPMENT_VALUES = EQUIPMENT.join(", ");

/**
 * "Build a set-based strength routine with Claude" — the history-driven cousin of
 * {@link buildPlanPrompt}.
 *
 * Where the plan prompt asks Claude for a *starting* routine from three answers,
 * this hands Claude the owner's own logged history for ONE compound lift and asks
 * it to periodise a concrete, set-based block (explicit reps × load per set,
 * anchored to the lifter's current one-rep max) aimed at a chosen emphasis —
 * raw strength, hypertrophy, or peaking a new 1RM. The reply pastes back as a
 * runnable {@link RoutineSheet} via the same parser the plan flow uses, so this
 * module only composes the prompt; parsing stays in `claudePlan.ts`.
 */

/** The training emphasis the generated block is built around. */
export type RoutineGoal = "strength" | "hypertrophy" | "peak-1rm";

export const ROUTINE_GOALS: readonly RoutineGoal[] = ["strength", "hypertrophy", "peak-1rm"];

/**
 * What the block covers: one selected compound lift (deep, 1RM-aware programming
 * for that movement) or the whole body (a balanced strength/hypertrophy split
 * across every muscle the user trains). "peak-1rm" only applies to a single lift.
 */
export type RoutineScope = "lift" | "whole";

/** The two goals a whole-body block supports (a 1RM peak is inherently lift-specific). */
export type WholeBodyGoal = Exclude<RoutineGoal, "peak-1rm">;

export interface RoutineInputs {
  /** The compound movement to build the block around (a catalog key). */
  key: ExerciseKey;
  /** Which adaptation the block targets. */
  goal: RoutineGoal;
  /** How many of the most recent sessions of this lift to feed Claude (0 = all). */
  sessionsBack: number;
  /** Training days per week the block should spread across. */
  daysPerWeek: number;
}

export interface WholeBodyInputs {
  /** Which adaptation the block targets (strength or hypertrophy). */
  goal: WholeBodyGoal;
  /** How many of the most recent sessions to summarise for Claude (0 = all). */
  sessionsBack: number;
  /** Training days per week the split should spread across. */
  daysPerWeek: number;
}

// English coaching brief for each emphasis — drives the rep/intensity guidance
// Claude is asked to follow, kept textbook-plain so the JSON it returns is sane.
const GOAL_BRIEF: Record<RoutineGoal, string> = {
  strength:
    "build maximal strength: heavy compound work in the ~3–6 rep range at roughly 80–90% of 1RM, long rests, 1–2 reps in reserve, with backed-off accessory volume.",
  hypertrophy:
    "maximise muscle growth: the main lift and accessories in the ~6–12 rep range at roughly 65–80% of 1RM, trained close to failure (0–2 reps in reserve), with enough weekly volume per muscle.",
  "peak-1rm":
    "peak toward a NEW one-rep max on this lift: a short wave-loading build that climbs in intensity and sheds volume across the sessions, ending near a heavy single/double at ~90–95%+ of 1RM with high reps in reserve early and low late.",
};

const GOAL_TITLE: Record<RoutineGoal, string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  "peak-1rm": "1RM Peak",
};

/** Short English title for an emphasis (prompt + sheet-name use only). */
export function goalTitle(goal: RoutineGoal): string {
  return GOAL_TITLE[goal];
}

// A compact, schema-accurate example so Claude's output shape is unambiguous: a
// *structured* sheet (kind:"session" with named sections) whose sets carry an
// explicit reps + loadKg, exactly what makes it runnable set-by-set. `id`/
// `updatedAt` are omitted — the app fills them on import. Bodyweight accessories
// omit `loadKg`.
const EXAMPLE_SHEET = {
  schema: SHEET_SCHEMA_ID,
  version: SHEET_SCHEMA_VERSION,
  name: "Bench Press — Strength Block",
  routines: [
    {
      kind: "session",
      title: "Day A · Heavy Bench",
      tags: ["Strength", "Bench Press"],
      sections: [
        {
          title: "Main",
          exercises: [
            {
              name: "Bench Press",
              muscle: "chest",
              equipment: "barbell",
              secondaryMuscles: ["triceps", "front-delts"],
              target: {
                kind: "sets",
                sets: [
                  { reps: 5, loadKg: 80 },
                  { reps: 5, loadKg: 85 },
                  { reps: 5, loadKg: 90 },
                ],
              },
              note: "Top set ~85% 1RM · 2 RIR",
            },
          ],
        },
        {
          title: "Accessory",
          exercises: [
            { name: "Overhead Press", muscle: "front-delts", equipment: "barbell", secondaryMuscles: ["side-delts", "triceps"], target: { kind: "sets", sets: [{ reps: 8, loadKg: 40 }, { reps: 8, loadKg: 40 }, { reps: 8, loadKg: 40 }] } },
            { name: "Dips", muscle: "chest", equipment: "calisthenics", secondaryMuscles: ["triceps"], target: { kind: "sets", sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] } },
          ],
        },
      ],
    },
    {
      kind: "session",
      title: "Day B · Volume Bench",
      tags: ["Hypertrophy", "Bench Press"],
      sections: [
        {
          title: "Main",
          exercises: [
            {
              name: "Bench Press",
              muscle: "chest",
              equipment: "barbell",
              secondaryMuscles: ["triceps", "front-delts"],
              target: {
                kind: "sets",
                sets: [
                  { reps: 8, loadKg: 72.5 },
                  { reps: 8, loadKg: 72.5 },
                  { reps: 8, loadKg: 72.5 },
                  { reps: 8, loadKg: 72.5 },
                ],
              },
              note: "~70% 1RM · 1 RIR",
            },
          ],
        },
      ],
    },
  ],
};

/** A movement is "selectable" here when it's a curated compound lift. */
export function isCompoundKey(key: ExerciseKey): boolean {
  const mv = findMovement(key);
  return mv !== undefined && isCompoundMovement(mv);
}

/** A compound the user can build a block for, with a menu label. */
export interface CompoundOption {
  key: ExerciseKey;
  label: string;
  /** How many sessions logged this lift — drives default selection + the "no history" note. */
  sessionCount: number;
}

/**
 * The compound lifts to offer in the selector: every curated compound the user
 * has actually logged, most-trained first (so the default lands on the lift with
 * the richest history). When the user has logged none, the caller falls back to
 * the full compound catalog so the feature still drafts a starting block.
 */
export function loggedCompoundOptions(sessions: TrainingSession[]): CompoundOption[] {
  return [...sessionCountsByExercise(sessions).entries()]
    .filter(([key]) => isCompoundKey(key))
    .map(([key, sessionCount]) => ({ key, label: exerciseKeyLabel(key), sessionCount }))
    .sort((a, b) => b.sessionCount - a.sessionCount || a.label.localeCompare(b.label));
}

/** Current best 1RM for a lift (heaviest logged tested max vs. best Epley estimate). */
function oneRmLine(sessions: TrainingSession[], key: ExerciseKey, loggedMaxes: Record<string, number>): string {
  const best = bestOneRm(sessions, key, loggedMaxes);
  const parts: string[] = [];
  if (best.logged > 0) parts.push(`tested ${round2(best.logged)} kg`);
  if (best.estimated > 0) parts.push(`estimated ${round2(best.estimated)} kg (Epley)`);
  return parts.length > 0 ? parts.join(", ") : "no max on record yet — infer a working max from the sets below";
}

/**
 * Compose the handoff prompt that asks Claude to design a set-based block for one
 * compound lift, anchored to the lifter's logged history and current 1RM. Plain
 * text, handed off via the existing share/copy flow; the reply pastes back as a
 * RoutineSheet through `parsePlanFromText`.
 */
export function buildRoutinePrompt(
  sessions: TrainingSession[],
  inputs: RoutineInputs,
  loggedMaxes: Record<string, number> = {},
): string {
  const { key, goal, sessionsBack, daysPerWeek } = inputs;
  const label = exerciseKeyLabel(key);
  const history = exerciseHistoryLines(sessions, key, sessionsBack);
  const days = daysPerWeek;
  const dayWord = days === 1 ? "day" : "days";

  return [
    "I'm using FitBuilder, a workout app, and I want you to program ONE compound lift for me.",
    "",
    `Lift: ${label}`,
    `Goal: ${GOAL_BRIEF[goal]}`,
    `Current one-rep max: ${oneRmLine(sessions, key, loggedMaxes)}.`,
    `Schedule: ${days} training ${dayWord} per week.`,
    "",
    `My recent sessions for this lift (oldest → newest), each set as reps×load${sessionsBack > 0 ? `, last ${sessionsBack}` : ""}:`,
    ...(history.length > 0 ? history : ["- (no sets logged yet — pick sensible starting loads from the goal and any max above)"]),
    "",
    `Design a set-based training block of exactly ${days} ${dayWord === "day" ? "routine" : "routines"} (one per training day) that progresses this lift toward the goal. Periodise across the days — vary intensity and volume, don't repeat the same session. Prescribe a real per-set scheme with explicit reps and a target load in kg for every working set of the main lift, computed from my current 1RM, plus 1–3 supporting accessories per day.`,
    "",
    ...sheetSpecLines(EXAMPLE_SHEET, "1RM"),
  ].join("\n");
}

// English coaching brief for a whole-body block — the same emphases as a single
// lift, restated for a balanced split across every muscle.
const WHOLE_GOAL_BRIEF: Record<WholeBodyGoal, string> = {
  strength:
    "build maximal strength across the whole body: main compound lifts in the ~3–6 rep range at roughly 80–90% of 1RM with long rests, supported by lighter accessory work.",
  hypertrophy:
    "build muscle across the whole body: most work in the ~6–12 rep range trained close to failure (0–2 reps in reserve), with balanced weekly volume per muscle (~10–20 hard sets each).",
};

// A whole-body example: a balanced split (here Upper / Lower) covering several
// muscles per day, each set carrying explicit reps + loadKg. Same schema, same
// runnable shape as the single-lift example.
const WHOLE_EXAMPLE_SHEET = {
  schema: SHEET_SCHEMA_ID,
  version: SHEET_SCHEMA_VERSION,
  name: "Upper / Lower — Hypertrophy",
  routines: [
    {
      kind: "session",
      title: "Upper",
      tags: ["Hypertrophy", "Upper"],
      sections: [
        {
          title: "Push",
          exercises: [
            { name: "Bench Press", muscle: "chest", equipment: "barbell", secondaryMuscles: ["triceps", "front-delts"], target: { kind: "sets", sets: [{ reps: 8, loadKg: 70 }, { reps: 8, loadKg: 70 }, { reps: 8, loadKg: 70 }] }, note: "~70% 1RM · 1 RIR" },
            { name: "Overhead Press", muscle: "front-delts", equipment: "barbell", secondaryMuscles: ["side-delts", "triceps"], target: { kind: "sets", sets: [{ reps: 10, loadKg: 35 }, { reps: 10, loadKg: 35 }, { reps: 10, loadKg: 35 }] } },
          ],
        },
        {
          title: "Pull",
          exercises: [
            { name: "Pull-Up", muscle: "back", equipment: "calisthenics", secondaryMuscles: ["biceps"], target: { kind: "sets", sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] } },
            { name: "Cable Row Machine", muscle: "back", equipment: "cable", secondaryMuscles: ["biceps", "traps"], target: { kind: "sets", sets: [{ reps: 12, loadKg: 45 }, { reps: 12, loadKg: 45 }, { reps: 12, loadKg: 45 }] } },
          ],
        },
      ],
    },
    {
      kind: "session",
      title: "Lower",
      tags: ["Hypertrophy", "Lower"],
      sections: [
        {
          title: "Main",
          exercises: [
            { name: "Barbell Squat", muscle: "legs", equipment: "barbell", secondaryMuscles: ["glutes", "lower-back"], target: { kind: "sets", sets: [{ reps: 8, loadKg: 90 }, { reps: 8, loadKg: 90 }, { reps: 8, loadKg: 90 }] }, note: "~72% 1RM · 1–2 RIR" },
            { name: "Romanian Deadlift", muscle: "legs", equipment: "barbell", secondaryMuscles: ["glutes", "lower-back"], target: { kind: "sets", sets: [{ reps: 10, loadKg: 80 }, { reps: 10, loadKg: 80 }, { reps: 10, loadKg: 80 }] } },
          ],
        },
        {
          title: "Accessory",
          exercises: [{ name: "Standing Calf Raise", muscle: "calves", equipment: "machine", target: { kind: "sets", sets: [{ reps: 15, loadKg: 40 }, { reps: 15, loadKg: 40 }, { reps: 15, loadKg: 40 }] } }],
        },
      ],
    },
  ],
};

/** The most recent session's sets for a key, formatted as "reps×load" (no date). */
function latestSetLine(sessions: TrainingSession[], key: ExerciseKey): string {
  const recentFirst = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const session of recentFirst) {
    const sets = session.exercises.filter((ex) => exerciseKey(ex) === key).flatMap((ex) => ex.sets);
    if (sets.length > 0) {
      return sets.map((s) => `${s.reps}×${s.weightKg > 0 ? `${round2(s.weightKg)}kg` : "BW"}`).join(", ");
    }
  }
  return "no sets";
}

/** The primary muscle a key trains (catalog movement, else the legacy "muscle::equipment" pairing). */
function keyPrimaryMuscle(key: ExerciseKey): MuscleGroup | undefined {
  if (key.includes("::")) {
    const muscle = key.split("::")[0];
    return muscle && (MUSCLE_GROUPS as readonly string[]).includes(muscle)
      ? (muscle as MuscleGroup)
      : undefined;
  }
  return findMovement(key)?.primaryMuscle;
}

/**
 * The user's training vocabulary, grouped by the muscle each movement primarily
 * trains: every logged exercise with its most recent set line and current best
 * 1RM. Gives a whole-body coach the movements, loads and balance to work from
 * without dumping every session. Cardio is skipped — this builds a lifting block.
 */
function trainingSummaryLines(
  sessions: TrainingSession[],
  loggedMaxes: Record<string, number>,
): string[] {
  const byMuscle = new Map<MuscleGroup, ExerciseKey[]>();
  for (const key of presentExerciseKeys(sessions)) {
    const muscle = keyPrimaryMuscle(key);
    if (muscle === undefined || muscle === "cardio") continue;
    let group = byMuscle.get(muscle);
    if (!group) {
      group = [];
      byMuscle.set(muscle, group);
    }
    group.push(key);
  }

  const lines: string[] = [];
  for (const muscle of MUSCLE_GROUPS) {
    const muscleKeys = byMuscle.get(muscle);
    if (!muscleKeys || muscleKeys.length === 0) continue;
    lines.push("", `${MUSCLE_LABELS[muscle]}:`);
    for (const key of muscleKeys) {
      const best = bestOneRm(sessions, key, loggedMaxes);
      const max =
        best.logged > 0
          ? ` · ~${round2(best.logged)} kg 1RM`
          : best.estimated > 0
            ? ` · ~${round2(best.estimated)} kg est. 1RM`
            : "";
      lines.push(`  - ${exerciseKeyLabel(key)}: ${latestSetLine(sessions, key)}${max}`);
    }
  }
  return lines;
}

/** The most recent `count` sessions by start time (all when count ≤ 0). */
function recentSessions(sessions: TrainingSession[], count: number): TrainingSession[] {
  if (count <= 0) return sessions;
  return [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).slice(-count);
}

/**
 * Compose the handoff prompt that asks Claude to design a whole-body set-based
 * split from the user's logged training across every muscle. The history-driven,
 * all-muscles cousin of {@link buildRoutinePrompt}; pastes back the same way.
 */
export function buildWholeBodyPrompt(
  sessions: TrainingSession[],
  inputs: WholeBodyInputs,
  loggedMaxes: Record<string, number> = {},
): string {
  const { goal, sessionsBack, daysPerWeek } = inputs;
  const summary = trainingSummaryLines(recentSessions(sessions, sessionsBack), loggedMaxes);
  const days = daysPerWeek;
  const dayWord = days === 1 ? "day" : "days";

  return [
    "I'm using FitBuilder, a workout app, and I want you to program a whole-body training week for me.",
    "",
    `Goal: ${WHOLE_GOAL_BRIEF[goal]}`,
    `Schedule: ${days} training ${dayWord} per week.`,
    "",
    summary.length > 0
      ? `What I currently train, grouped by muscle (each movement's latest sets as reps×load, plus my best 1RM)${sessionsBack > 0 ? `, from my last ${sessionsBack} sessions` : ""}:`
      : "I have no training history logged yet — design a sensible balanced starting split.",
    ...summary,
    "",
    `Design a set-based split of exactly ${days} ${dayWord === "day" ? "routine" : "routines"} (one per training day) that covers all the major muscle groups across the week, balancing weekly volume per muscle. Prefer movements I already train (above), but add or swap where it improves balance. Prescribe a real per-set scheme with explicit reps and a target load in kg for every working set, computed from the loads and 1RMs above.`,
    "",
    ...sheetSpecLines(WHOLE_EXAMPLE_SHEET, "the loads above"),
  ].join("\n");
}

/**
 * The shared tail every routine prompt ends with: "return it as this exact JSON
 * shape" plus the field notes that pin down the schema. `anchor` names what loads
 * are computed from (a single lift's 1RM, or the whole-body load summary).
 */
function sheetSpecLines(example: unknown, anchor: string): string[] {
  return [
    'Return the block as a FitBuilder "routine sheet" — a JSON object with this exact shape:',
    "",
    "```json",
    JSON.stringify(example, null, 2),
    "```",
    "",
    "Field notes:",
    `- "schema" must be exactly "${SHEET_SCHEMA_ID}" and "version" must be ${SHEET_SCHEMA_VERSION}.`,
    '- "name": a short title for the whole block (mention the goal).',
    '- "routines": one entry per training day. Set "kind" to "session" and organise each day into named "sections" (e.g. "Main", "Accessory"). Give each a short "title" and a couple of "tags".',
    '- Each exercise has a "name" and a structured "target". Use { "kind": "sets", "sets": [{ "reps": 5, "loadKg": 90 }, ...] } so each working set carries its own reps and load in kg. Omit "loadKg" only for true bodyweight movements. You may add a short "note" for the intensity cue (e.g. "~85% 1RM · 2 RIR").',
    `- Also tag every exercise with "muscle" (its primary muscle group) and "equipment" (how it's loaded), plus "secondaryMuscles" (an array) for compound lifts that also work other muscles. Use these exact "muscle"/"secondaryMuscles" values: ${MUSCLE_VALUES}. Use these exact "equipment" values: ${EQUIPMENT_VALUES}. Pick the closest match for each.`,
    `- Anchor every loadKg to ${anchor} (convert any %1RM to kg) and round to a realistic gym increment (nearest 2.5 kg for barbells).`,
    "",
    "Reply with ONLY one ```json code block containing the block, and no other text.",
  ];
}
