import { findMovement } from "./movements";
import { exerciseHistoryLines } from "./progression";
import { bestOneRm, exerciseKey, exerciseKeyLabel, type ExerciseKey } from "./stats";
import { SHEET_SCHEMA_ID, SHEET_SCHEMA_VERSION, type TrainingSession } from "./types";
import { round2 } from "./util";

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
            { name: "Overhead Press", target: { kind: "sets", sets: [{ reps: 8, loadKg: 40 }, { reps: 8, loadKg: 40 }, { reps: 8, loadKg: 40 }] } },
            { name: "Dips", target: { kind: "sets", sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] } },
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

/** A movement is "selectable" here when it's a curated compound — it taxes secondaries. */
export function isCompoundKey(key: ExerciseKey): boolean {
  const mv = findMovement(key);
  return mv !== undefined && mv.secondaryMuscles.length > 0;
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
  const counts = new Map<ExerciseKey, number>();
  for (const session of sessions) {
    const seen = new Set<ExerciseKey>();
    for (const ex of session.exercises) {
      if (ex.sets.length === 0) continue;
      const key = exerciseKey(ex);
      if (!isCompoundKey(key) || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
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
    'Return the block as a FitBuilder "routine sheet" — a JSON object with this exact shape:',
    "",
    "```json",
    JSON.stringify(EXAMPLE_SHEET, null, 2),
    "```",
    "",
    "Field notes:",
    `- "schema" must be exactly "${SHEET_SCHEMA_ID}" and "version" must be ${SHEET_SCHEMA_VERSION}.`,
    '- "name": a short title for the whole block (mention the lift and the goal).',
    '- "routines": one entry per training day. Set "kind" to "session" and organise each day into named "sections" (e.g. "Main", "Accessory"). Give each a short "title" and a couple of "tags".',
    '- Each exercise has a "name" and a structured "target". Use { "kind": "sets", "sets": [{ "reps": 5, "loadKg": 90 }, ...] } so each working set carries its own reps and load in kg. Omit "loadKg" only for true bodyweight movements. You may add a short "note" for the intensity cue (e.g. "~85% 1RM · 2 RIR").',
    "- Anchor every loadKg to my current 1RM (convert your %1RM to kg) and round to a realistic gym increment (nearest 2.5 kg for barbells).",
    "",
    "Reply with ONLY one ```json code block containing the block, and no other text.",
  ].join("\n");
}
