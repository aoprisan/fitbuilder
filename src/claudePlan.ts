import { SHEET_SCHEMA_ID, SHEET_SCHEMA_VERSION, type RoutineSheet } from "./types";
import { SheetValidationError, validateSheet } from "./sheetValidate";

export type Goal = "muscle" | "fat-loss" | "strength" | "calisthenics";
export type Level = "beginner" | "intermediate" | "advanced";

export interface PlanInputs {
  goal: Goal;
  level: Level;
  daysPerWeek: number;
}

const GOAL_TEXT: Record<Goal, string> = {
  muscle: "build muscle (hypertrophy)",
  "fat-loss": "lose fat while keeping muscle",
  strength: "get stronger on the main lifts",
  calisthenics: "progress at bodyweight / calisthenics skills",
};

const LEVEL_TEXT: Record<Level, string> = {
  beginner: "a beginner",
  intermediate: "an intermediate trainee",
  advanced: "an advanced trainee",
};

// A compact, schema-accurate example so Claude's output shape is unambiguous.
// `id`/`updatedAt` are intentionally omitted — the app fills them on import.
const EXAMPLE_SHEET = {
  schema: SHEET_SCHEMA_ID,
  version: SHEET_SCHEMA_VERSION,
  name: "Push / Pull / Legs",
  routines: [
    {
      title: "Push Day",
      tags: ["Chest · Shoulders · Triceps", "Intermediate"],
      exercises: [
        {
          name: "Bench Press",
          target: {
            kind: "sets",
            sets: [
              { reps: 8, loadKg: 60 },
              { reps: 8, loadKg: 60 },
              { reps: 6, loadKg: 65 },
              { reps: 6, loadKg: 65 },
            ],
          },
        },
        {
          name: "Overhead Press",
          target: { kind: "sets", sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] },
        },
        { name: "Push-Ups", target: { kind: "volume", totalReps: 50 } },
      ],
    },
  ],
};

/** Compose the handoff prompt that asks Claude for a FitBuilder routine sheet. */
export function buildPlanPrompt(inputs: PlanInputs): string {
  const goal = GOAL_TEXT[inputs.goal];
  const level = LEVEL_TEXT[inputs.level];
  const days = inputs.daysPerWeek;
  const dayWord = days === 1 ? "day" : "days";
  const routineWord = days === 1 ? "routine" : "routines";

  return [
    "I'm using FitBuilder, a workout app. Please design a starting training plan for me.",
    "",
    `About me: I'm ${level} and I train ${days} ${dayWord} per week. My goal is to ${goal}.`,
    "",
    'Return the plan as a FitBuilder "routine sheet" — a JSON object with this exact shape:',
    "",
    "```json",
    JSON.stringify(EXAMPLE_SHEET, null, 2),
    "```",
    "",
    "Field notes:",
    `- "schema" must be exactly "${SHEET_SCHEMA_ID}" and "version" must be ${SHEET_SCHEMA_VERSION}.`,
    '- "name": a short title for the whole plan.',
    '- "routines": one entry per training day. Each has a "title", a few short "tags" (focus or level labels), and "exercises".',
    '- Each exercise has a "name" and a structured "target". Use { "kind": "sets", "sets": [{ "reps": 8, "loadKg": 60 }, ...] } for a fixed per-set scheme (omit "loadKg" for bodyweight), or { "kind": "volume", "totalReps": 50 } for a self-paced total-rep goal. You may add a short "note" for a cue.',
    `- Make exactly ${days} ${routineWord}, one per training day, matched to my goal and level.`,
    "",
    "Reply with ONLY one ```json code block containing the plan, and no other text.",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pull the JSON payload out of Claude's reply (a fenced block, else the outermost braces). */
function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const inner = fence[1]?.trim() ?? "";
    if (inner !== "") return inner;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

/**
 * Turn pasted text from Claude into a valid RoutineSheet. The schema markers are
 * forced to the correct constants (so a plan is accepted even if Claude omits or
 * mistypes them) before the real validation runs.
 */
export function parsePlanFromText(text: string): RoutineSheet {
  const json = extractJson(text);
  if (json === null) {
    throw new SheetValidationError(
      "Couldn't find a plan in that text. Paste the JSON Claude gave you.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SheetValidationError(
      "That doesn't look like valid JSON. Copy the whole plan from Claude and try again.",
    );
  }

  if (isRecord(parsed)) {
    parsed["schema"] = SHEET_SCHEMA_ID;
    parsed["version"] = SHEET_SCHEMA_VERSION;
    const name = parsed["name"];
    if (typeof name !== "string" || name.trim() === "") {
      parsed["name"] = "My Claude plan";
    }
  }

  return validateSheet(parsed);
}
