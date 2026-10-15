import { newTrainingSession } from "./log";
import { coerceExercise } from "./logValidate";
import {
  isCardio,
  type LoggedExercise,
  type SetTarget,
  type TrainingSession,
} from "./types";
import { cloneTarget, uuid } from "./util";

/**
 * Workout templates — named, reusable session plans ("Push A", "Legs"). A
 * template is a list of exercises with no logged sets; each carries the working
 * sets it was saved from as a structured `target`, so a session started from it
 * gets the live plan benchmark and the "plan" reps × load pick for free.
 * Stored on this device only, like the session log; `backup.ts` picks the key
 * up with every other "gymlog.*" entry.
 */

/** A template exercise: a logged exercise minus its sets and tested 1RM. */
export type TemplateExercise = Omit<LoggedExercise, "sets" | "oneRmKg">;

export interface WorkoutTemplate {
  schema: typeof TEMPLATE_SCHEMA_ID;
  version: 1;
  id: string;
  name: string;
  exercises: TemplateExercise[];
  createdAt: string;
  updatedAt: string;
}

export const TEMPLATE_SCHEMA_ID = "gymlog.workout-template" as const;

/** localStorage key of the template list (also watched for cross-tab changes). */
export const TEMPLATES_KEY = "gymlog.templates";

function stripSets(ex: LoggedExercise): TemplateExercise {
  const { sets: _sets, oneRmKg: _oneRm, ...rest } = ex;
  return rest;
}

function coerceTemplate(input: unknown): WorkoutTemplate | null {
  if (typeof input !== "object" || input === null) return null;
  const rec = input as Record<string, unknown>;
  if (rec["schema"] !== TEMPLATE_SCHEMA_ID) return null;
  const id = typeof rec["id"] === "string" && rec["id"] !== "" ? rec["id"] : uuid();
  const name = typeof rec["name"] === "string" ? rec["name"] : "";
  const rawEx = rec["exercises"];
  const exercises = Array.isArray(rawEx)
    ? rawEx.map((e) => stripSets(coerceExercise(e))).filter((e) => e.name !== "")
    : [];
  const created = typeof rec["createdAt"] === "string" ? rec["createdAt"] : new Date().toISOString();
  const updated = typeof rec["updatedAt"] === "string" ? rec["updatedAt"] : created;
  return { schema: TEMPLATE_SCHEMA_ID, version: 1, id, name, exercises, createdAt: created, updatedAt: updated };
}

/** Every saved template, most recently updated first; malformed entries dropped. */
export function loadTemplates(): WorkoutTemplate[] {
  let raw: unknown;
  try {
    const text = localStorage.getItem(TEMPLATES_KEY);
    if (text === null) return [];
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: WorkoutTemplate[] = [];
  for (const entry of raw) {
    const tpl = coerceTemplate(entry);
    if (tpl && tpl.exercises.length > 0) out.push(tpl);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function writeAll(templates: WorkoutTemplate[]): boolean {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch {
    // Quota or privacy-mode failure: the template just won't persist.
    return false;
  }
}

/**
 * The plan an exercise's logged work implies: its working sets (warm-ups
 * dropped) as a per-set reps × load scheme. Falls back to the target it already
 * carried, and to none for cardio or an exercise with no working sets.
 */
function targetFromSets(ex: LoggedExercise): LoggedExercise["target"] {
  const working = ex.sets.filter((s) => s.setType !== "warmup" && s.reps > 0);
  if (isCardio(ex.equipment) || working.length === 0) {
    return ex.target ? cloneTarget(ex.target) : undefined;
  }
  const sets: SetTarget[] = working.map((s) => ({
    reps: s.reps,
    ...(s.weightKg > 0 ? { loadKg: s.weightKg } : {}),
  }));
  return { kind: "sets", sets };
}

/**
 * Build a template from a session: every exercise it lists, in order, with the
 * working sets logged in it saved as the exercise's target.
 */
export function templateFromSession(session: TrainingSession, name: string): WorkoutTemplate {
  const now = new Date().toISOString();
  return {
    schema: TEMPLATE_SCHEMA_ID,
    version: 1,
    id: uuid(),
    name: name.trim() || session.name,
    exercises: session.exercises.map((ex) => {
      const target = targetFromSets(ex);
      const { target: _old, ...rest } = stripSets(ex);
      return { ...rest, ...(target ? { target } : {}) };
    }),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Insert or update a template by id. A new template whose name matches an
 * existing one (case-insensitively) replaces it, so re-saving "Push A" updates
 * the plan rather than piling up copies. Returns false when storage is full.
 */
export function saveTemplate(tpl: WorkoutTemplate): boolean {
  const key = tpl.name.trim().toLowerCase();
  const kept = loadTemplates().filter(
    (x) => x.id !== tpl.id && x.name.trim().toLowerCase() !== key,
  );
  return writeAll([{ ...tpl, updatedAt: new Date().toISOString() }, ...kept]);
}

/** Remove a template by id. */
export function deleteTemplate(id: string): void {
  writeAll(loadTemplates().filter((x) => x.id !== id));
}

/** A fresh session pre-loaded with a template's exercises and their targets. */
export function sessionFromTemplate(tpl: WorkoutTemplate): TrainingSession {
  return {
    ...newTrainingSession(),
    name: tpl.name,
    exercises: tpl.exercises.map((ex) => ({
      ...ex,
      ...(ex.secondaryMuscles ? { secondaryMuscles: [...ex.secondaryMuscles] } : {}),
      ...(ex.target ? { target: cloneTarget(ex.target) } : {}),
      sets: [],
    })),
  };
}
